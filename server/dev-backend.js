const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const { readingJsonSchema } = require("../miniprogram/services/reading-schema");

loadEnvFile(".env.local");
loadEnvFile(".env");

const PORT = Number(process.env.PORT || 8787);
const WECHAT_APPID = process.env.WECHAT_APPID || "wx19531898b7da5eec";
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_API_MODE = process.env.OPENAI_API_MODE || (OPENAI_BASE_URL.includes("api.openai.com") ? "responses" : "chat_completions");
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "low";
const READING_SOURCE_LABEL = "GPT-5.4 mini 备用";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL_SECONDS = 60 * 60;
const READING_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const READING_JOB_TTL_MS = 10 * 60 * 1000;

const inFlightReadings = new Map();
const readingResponseCache = new Map();
const readingJobs = new Map();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendEmpty(response, 204);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname !== "/health") {
      console.log(`${new Date().toISOString()} ${request.method} ${url.pathname}`);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        appid: WECHAT_APPID,
        model: OPENAI_MODEL,
        aiMode: OPENAI_API_MODE,
        reasoningEffort: OPENAI_REASONING_EFFORT,
        openaiConfigured: Boolean(OPENAI_API_KEY),
        wechatConfigured: Boolean(WECHAT_APPSECRET)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/auth/wechat") {
      const body = await readJson(request);
      const authResult = await authenticateWechat(body.loginCode);
      const accessToken = signToken({
        sub: authResult.openid,
        provider: "wechat",
        mode: authResult.mode,
        iat: nowSeconds(),
        exp: nowSeconds() + TOKEN_TTL_SECONDS
      });

      sendJson(response, 200, {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: TOKEN_TTL_SECONDS,
        provider: "微信",
        mode: authResult.mode,
        openai_configured: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        label: authResult.mode === "wechat" ? "微信后端会话" : "本地后端会话"
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/readings") {
      const requestId = String(request.headers["x-request-id"] || crypto.randomUUID());
      const startedAt = Date.now();
      const session = verifyAuthorization(request.headers.authorization || "");
      const asyncRequested =
        url.searchParams.get("async") === "1" ||
        String(request.headers.prefer || "").includes("respond-async") ||
        request.headers["x-reading-mode"] === "async";
      const cachedResponse = getCachedReadingResponse(requestId);

      if (cachedResponse) {
        sendJson(response, 200, cachedResponse);
        console.log(`${new Date().toISOString()} POST /readings ${requestId} cached ${Date.now() - startedAt}ms`);
        return;
      }

      const body = await readJson(request);
      const readingRequest = validateReadingRequest(body.request);

      if (!OPENAI_API_KEY) {
        throw publicError(503, "后端尚未配置 AI 提供方令牌。");
      }

      if (asyncRequested) {
        startReadingJob({
          requestId,
          session,
          readingRequest,
          responseFormat: body.responseFormat || readingJsonSchema()
        });
        sendReadingPending(response, requestId);
        console.log(`${new Date().toISOString()} POST /readings ${requestId} accepted ${Date.now() - startedAt}ms`);
        return;
      }

      let responseBody;

      if (inFlightReadings.has(requestId)) {
        responseBody = await inFlightReadings.get(requestId);
      } else {
        const readingPromise = createReadingResponse({
          session,
          readingRequest,
          responseFormat: body.responseFormat || readingJsonSchema()
        });

        inFlightReadings.set(requestId, readingPromise);

        try {
          responseBody = await readingPromise;
          cacheReadingResponse(requestId, responseBody);
        } finally {
          inFlightReadings.delete(requestId);
        }
      }

      sendJson(response, 200, responseBody);
      console.log(`${new Date().toISOString()} POST /readings ${requestId} complete ${Date.now() - startedAt}ms`);
      return;
    }

    if (request.method === "GET" && url.pathname === "/readings/status") {
      verifyAuthorization(request.headers.authorization || "");
      const requestId = String(url.searchParams.get("requestId") || "");
      const startedAt = Date.now();

      if (!requestId) {
        throw publicError(400, "缺少解读请求 ID。");
      }

      const cachedResponse = getCachedReadingResponse(requestId);

      if (cachedResponse) {
        sendJson(response, 200, cachedResponse);
        console.log(`${new Date().toISOString()} GET /readings/status ${requestId} cached ${Date.now() - startedAt}ms`);
        return;
      }

      const job = getReadingJob(requestId);

      if (!job) {
        console.log(`${new Date().toISOString()} GET /readings/status ${requestId} missing ${Date.now() - startedAt}ms`);
        throw publicError(404, "解读尚未完成。");
      }

      if (job.status === "failed") {
        console.log(`${new Date().toISOString()} GET /readings/status ${requestId} failed ${Date.now() - startedAt}ms`);
        throw publicError(job.statusCode || 502, job.error || "AI 解读生成失败。");
      }

      if (job.status === "completed" && job.responseBody) {
        sendJson(response, 200, job.responseBody);
        console.log(`${new Date().toISOString()} GET /readings/status ${requestId} complete ${Date.now() - startedAt}ms`);
        return;
      }

      sendReadingPending(response, requestId);
      console.log(`${new Date().toISOString()} GET /readings/status ${requestId} pending ${Date.now() - startedAt}ms`);
      return;
    }

    sendJson(response, 404, {
      error: "接口不存在。"
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      error: error.publicMessage || "后端请求失败。"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tarot test backend listening on http://127.0.0.1:${PORT}`);
  console.log(`OpenAI configured: ${OPENAI_API_KEY ? "yes" : "no"}; WeChat secret configured: ${WECHAT_APPSECRET ? "yes" : "no"}`);
});

async function authenticateWechat(loginCode) {
  if (!loginCode || typeof loginCode !== "string") {
    throw publicError(400, "缺少微信登录 code。");
  }

  if (!WECHAT_APPSECRET) {
    return {
      mode: "dev",
      openid: "dev-wechat-user"
    };
  }

  const response = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?${new URLSearchParams({
      appid: WECHAT_APPID,
      secret: WECHAT_APPSECRET,
      js_code: loginCode,
      grant_type: "authorization_code"
    })}`
  );
  const data = await response.json();

  if (!response.ok || data.errcode || !data.openid) {
    throw publicError(502, data.errmsg || "微信登录换取会话失败。");
  }

  return {
    mode: "wechat",
    openid: data.openid
  };
}

async function createReadingResponse({ session, readingRequest, responseFormat }) {
  const reading = await generateOpenAIReading({
    readingRequest,
    responseFormat
  });

  return {
    reading,
    backend: {
      mode: session.mode,
      openaiConfigured: true,
      model: OPENAI_MODEL
    }
  };
}

async function generateOpenAIReading({ readingRequest, responseFormat }) {
  if (OPENAI_API_MODE === "chat_completions") {
    return generateChatCompletionReading({ readingRequest, responseFormat });
  }

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "你为移动端小程序撰写克制、反思性的塔罗解读。",
        "只返回符合所给 schema 的 JSON，不要输出 markdown、解释文字或代码块。",
        `sourceLabel 必须使用 \"${READING_SOURCE_LABEL}\"。`,
        "应用已经完成抽牌。不要替换、重抽、删除或编造牌。",
        "所有面向用户的文字字段必须使用简体中文。JSON key 保持英文。",
        "语气温和、具体、有帮助。避免确定性预言，也不要提供医疗、法律、财务或紧急事务建议。"
      ].join(" "),
      input: `Create a tarot reading for this request:\n${JSON.stringify(readingRequest, null, 2)}`,
      text: {
        format: responseFormat
      },
      reasoning: {
        effort: OPENAI_REASONING_EFFORT
      },
      max_output_tokens: 1400
    })
  });
  const data = await response.json();

  if (!response.ok) {
    throw publicError(502, data.error && data.error.message ? data.error.message : "AI 解读生成失败。");
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    throw publicError(502, "AI 响应没有包含 JSON 解读。");
  }

  try {
    return {
      ...JSON.parse(outputText),
      sourceLabel: READING_SOURCE_LABEL
    };
  } catch (error) {
    throw publicError(502, "AI 响应不是有效 JSON。");
  }
}

async function generateChatCompletionReading({ readingRequest, responseFormat }) {
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你为移动端小程序撰写克制、反思性的塔罗解读。",
            "只返回一个有效 JSON 对象，不要输出 markdown、解释文字或代码块。",
            "JSON 必须符合所给 schema。",
            `sourceLabel 必须使用 \"${READING_SOURCE_LABEL}\"。`,
            "应用已经完成抽牌。不要替换、重抽、删除或编造牌。",
            "所有面向用户的文字字段必须使用简体中文。JSON key 保持英文。",
            "语气温和、具体、有帮助。避免确定性预言，也不要提供专业建议。"
          ].join(" ")
        },
        {
          role: "user",
          content: [
            "JSON schema:",
            JSON.stringify(responseFormat.schema || responseFormat, null, 2),
            "Reading request:",
            JSON.stringify(readingRequest, null, 2)
          ].join("\n")
        }
      ],
      reasoning_effort: OPENAI_REASONING_EFFORT,
      max_tokens: 1800
    })
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data.error && data.error.message ? data.error.message : "AI 解读生成失败。";
    throw publicError(502, message);
  }

  const outputText =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content
      : "";

  if (!outputText) {
    throw publicError(502, "AI 响应没有包含 JSON 解读。");
  }

  try {
    return {
      ...JSON.parse(extractJsonObject(outputText)),
      sourceLabel: READING_SOURCE_LABEL
    };
  } catch (error) {
    throw publicError(502, "AI 响应不是有效 JSON。");
  }
}

function validateReadingRequest(readingRequest) {
  if (!readingRequest || typeof readingRequest !== "object") {
    throw publicError(400, "缺少解读请求。");
  }

  if (!readingRequest.spread || !Array.isArray(readingRequest.drawnCards)) {
    throw publicError(400, "解读请求必须包含牌阵和已抽取牌面。");
  }

  if (readingRequest.drawnCards.length < 1 || readingRequest.drawnCards.length > 10) {
    throw publicError(400, "解读请求必须包含 1 到 10 张已抽取牌面。");
  }

  return readingRequest;
}

function verifyAuthorization(header) {
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw publicError(401, "Missing bearer token.");
  }

  return verifyToken(match[1]);
}

function signToken(payload) {
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = hmac(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split(".");

  if (parts.length !== 2) {
    throw publicError(401, "Invalid bearer token.");
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = hmac(encodedPayload);

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw publicError(401, "Invalid bearer token.");
  }

  let payload;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch (error) {
    throw publicError(401, "Invalid bearer token.");
  }

  if (!payload.exp || payload.exp <= nowSeconds()) {
    throw publicError(401, "Bearer token expired.");
  }

  return payload;
}

function hmac(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  return data.output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return extractJsonObject(fenced[1]);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function startReadingJob({ requestId, session, readingRequest, responseFormat }) {
  sweepReadingJobs();

  const existingJob = getReadingJob(requestId);

  if (existingJob) {
    return existingJob;
  }

  const job = {
    status: "pending",
    expiresAt: Date.now() + READING_JOB_TTL_MS
  };

  readingJobs.set(requestId, job);

  createReadingResponse({
    session,
    readingRequest,
    responseFormat
  })
    .then((responseBody) => {
      job.status = "completed";
      job.responseBody = responseBody;
      job.expiresAt = Date.now() + READING_JOB_TTL_MS;
      cacheReadingResponse(requestId, responseBody);
      console.log(`${new Date().toISOString()} JOB /readings ${requestId} complete`);
    })
    .catch((error) => {
      job.status = "failed";
      job.statusCode = error.statusCode || 502;
      job.error = error.publicMessage || error.message || "AI reading generation failed.";
      job.expiresAt = Date.now() + READING_JOB_TTL_MS;
      console.log(`${new Date().toISOString()} JOB /readings ${requestId} failed ${job.error}`);
    });

  return job;
}

function getReadingJob(requestId) {
  const job = readingJobs.get(requestId);

  if (!job) {
    return null;
  }

  if (job.expiresAt <= Date.now()) {
    readingJobs.delete(requestId);
    return null;
  }

  return job;
}

function sweepReadingJobs() {
  const now = Date.now();

  for (const [requestId, job] of readingJobs.entries()) {
    if (job.expiresAt <= now) {
      readingJobs.delete(requestId);
    }
  }
}

function sendReadingPending(response, requestId) {
  sendJson(response, 202, {
    status: "pending",
    requestId,
    retryAfterMs: 1500
  });
}

function getCachedReadingResponse(requestId) {
  const cached = readingResponseCache.get(requestId);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    readingResponseCache.delete(requestId);
    return null;
  }

  return cached.responseBody;
}

function cacheReadingResponse(requestId, responseBody) {
  readingResponseCache.set(requestId, {
    responseBody,
    expiresAt: Date.now() + READING_RESPONSE_CACHE_TTL_MS
  });

  if (readingResponseCache.size > 100) {
    const firstKey = readingResponseCache.keys().next().value;

    if (firstKey) {
      readingResponseCache.delete(firstKey);
    }
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(publicError(413, "Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(publicError(400, "Request body must be valid JSON."));
      }
    });
  });
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, Prefer, X-Reading-Mode",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, Prefer, X-Reading-Mode",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  response.end();
}

function publicError(statusCode, publicMessage) {
  const error = new Error(publicMessage);

  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function loadEnvFile(filename) {
  const envPath = path.resolve(filename);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function normalizeBaseUrl(value) {
  return String(value || "https://api.openai.com/v1").replace(/\/+$/, "");
}
