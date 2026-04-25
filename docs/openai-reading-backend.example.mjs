import http from "node:http";

const port = Number(process.env.PORT || 8787);
const openAIKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/readings") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const bearerToken = readBearerToken(request.headers.authorization || "");

  if (!bearerToken) {
    sendJson(response, 401, { error: "Missing OAuth bearer token." });
    return;
  }

  if (!openAIKey) {
    sendJson(response, 500, { error: "OPENAI_API_KEY is not configured." });
    return;
  }

  try {
    const body = await readJson(request);

    // Replace this with real OAuth token introspection for your provider.
    await assertUserCanGenerateReading(bearerToken);

    const reading = await generateReading(body.request, body.responseFormat);

    sendJson(response, 200, { reading });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unable to generate reading." });
  }
});

server.listen(port, () => {
  console.log(`Reading backend listening on http://localhost:${port}`);
});

async function generateReading(readingRequest, responseFormat) {
  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are an AI tarot interpreter for a mobile app.",
        "Treat tarot as symbolic self-reflection, not certain prediction.",
        "Do not give medical, legal, financial, or emergency advice.",
        "Interpret only the drawn cards in the request.",
        "Return JSON matching the provided schema."
      ].join("\n"),
      input: JSON.stringify(readingRequest, null, 2),
      text: {
        format: responseFormat
      },
      max_output_tokens: 900,
      store: false
    })
  });

  const data = await openAIResponse.json();

  if (!openAIResponse.ok) {
    throw new Error(data.error?.message || `OpenAI API error ${openAIResponse.status}`);
  }

  const outputText =
    data.output_text ||
    (data.output || [])
      .flatMap((item) => item.content || [])
      .map((content) => content.text || "")
      .join("\n");

  if (!outputText) {
    throw new Error("OpenAI returned no structured reading text.");
  }

  return JSON.parse(outputText);
}

async function assertUserCanGenerateReading(_bearerToken) {
  // For production, verify the OAuth access token here before spending OpenAI tokens.
  return true;
}

function readBearerToken(authorization) {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(rawBody || "{}"));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}
