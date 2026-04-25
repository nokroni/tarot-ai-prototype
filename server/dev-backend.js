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
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL_SECONDS = 60 * 60;

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
        provider: "WeChat",
        mode: authResult.mode,
        openai_configured: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        label: authResult.mode === "wechat" ? "WeChat Backend Session" : "Local Backend Session"
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/readings") {
      const session = verifyAuthorization(request.headers.authorization || "");
      const body = await readJson(request);
      const readingRequest = validateReadingRequest(body.request);

      if (!OPENAI_API_KEY) {
        throw publicError(503, "AI provider bearer token is not configured on the reading backend.");
      }

      const reading = await generateOpenAIReading({
        readingRequest,
        responseFormat: body.responseFormat || readingJsonSchema()
      });

      sendJson(response, 200, {
        reading,
        backend: {
          mode: session.mode,
          openaiConfigured: true,
          model: OPENAI_MODEL
        }
      });
      return;
    }

    sendJson(response, 404, {
      error: "Route not found."
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(response, statusCode, {
      error: error.publicMessage || "Backend request failed."
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tarot test backend listening on http://127.0.0.1:${PORT}`);
  console.log(`OpenAI configured: ${OPENAI_API_KEY ? "yes" : "no"}; WeChat secret configured: ${WECHAT_APPSECRET ? "yes" : "no"}`);
});

async function authenticateWechat(loginCode) {
  if (!loginCode || typeof loginCode !== "string") {
    throw publicError(400, "Missing WeChat login code.");
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
    throw publicError(502, data.errmsg || "WeChat login exchange failed.");
  }

  return {
    mode: "wechat",
    openid: data.openid
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
        "You write reflective tarot readings for a mobile Mini Program.",
        "Return only JSON that matches the supplied schema.",
        "The app has already drawn the cards. Do not replace, redraw, or invent cards.",
        "Keep the tone grounded, concise, and useful. Avoid certainty, fortune telling, or professional advice."
      ].join(" "),
      input: `Create a tarot reading for this request:\n${JSON.stringify(readingRequest, null, 2)}`,
      text: {
        format: responseFormat
      },
      max_output_tokens: 1400
    })
  });
  const data = await response.json();

  if (!response.ok) {
    throw publicError(502, data.error && data.error.message ? data.error.message : "OpenAI reading generation failed.");
  }

  const outputText = extractOutputText(data);

  if (!outputText) {
    throw publicError(502, "OpenAI response did not include JSON output text.");
  }

  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw publicError(502, "OpenAI response was not valid JSON.");
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
            "You write reflective tarot readings for a mobile Mini Program.",
            "Return exactly one valid JSON object and no markdown, prose, or code fences.",
            "The JSON must match the supplied schema.",
            "Use sourceLabel \"GPT-5.4 mini via Codex\".",
            "The app has already drawn the cards. Do not replace, redraw, or invent cards.",
            "Keep the tone grounded, concise, and useful. Avoid certainty, fortune telling, or professional advice."
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
      max_tokens: 1800
    })
  });
  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data.error && data.error.message ? data.error.message : "AI reading generation failed.";
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
    throw publicError(502, "AI response did not include JSON output text.");
  }

  try {
    return {
      ...JSON.parse(extractJsonObject(outputText)),
      sourceLabel: "GPT-5.4 mini via Codex"
    };
  } catch (error) {
    throw publicError(502, "AI response was not valid JSON.");
  }
}

function validateReadingRequest(readingRequest) {
  if (!readingRequest || typeof readingRequest !== "object") {
    throw publicError(400, "Missing reading request.");
  }

  if (!readingRequest.spread || !Array.isArray(readingRequest.drawnCards)) {
    throw publicError(400, "Reading request must include spread and drawnCards.");
  }

  if (readingRequest.drawnCards.length < 1 || readingRequest.drawnCards.length > 10) {
    throw publicError(400, "Reading request must include between 1 and 10 drawn cards.");
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
