import fs from 'fs';
import path from 'path';
import createClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

/**
 * Configuration
 * GITHUB_TOKEN must be a GitHub fine-grained or classic PAT with model inference access.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

// Use a multimodal-capable model. Options: gpt-4o, gpt-4o-mini, phi-3.5-vision-instruct, etc.
const model = "gpt-4o-mini";

// Image path (ensure the file exists alongside this script)
const imagePath = path.resolve("contoso_layout_sketch.jpg");

// Basic file checks
if (!fs.existsSync(imagePath)) {
  console.error(`Image file not found at: ${imagePath}`);
  process.exit(1);
}
const stats = fs.statSync(imagePath);
const maxBytes = 15 * 1024 * 1024; // 15MB safety (adjust if service docs allow more)
if (stats.size > maxBytes) {
  console.error(`Image file is too large (${stats.size} bytes). Limit ~${maxBytes} bytes.`);
  process.exit(1);
}

// Read & encode the image as Data URL
const imageBytes = fs.readFileSync(imagePath);
const imageBase64 = imageBytes.toString("base64");
const mimeType = "image/jpeg"; // change to image/png if necessary
const dataUrl = `data:${mimeType};base64,${imageBase64}`;

const client = createClient(
  "https://models.inference.ai.azure.com",
  new AzureKeyCredential(GITHUB_TOKEN)
);

async function run() {
  const userPrompt = "Write HTML and CSS code for a webpage based on the following hand-drawn sketch";

  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        // IMPORTANT: use 'text' and 'image_url' types (not input_text/input_image)
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: dataUrl
            }
          }
        ]
      }
    ],
    temperature: 0.4,
    max_tokens: 1200
  };

  let response;
  try {
    response = await client.path("/chat/completions").post({ body: requestBody });
  } catch (networkErr) {
    console.error("Network / transport error:", networkErr);
    process.exit(1);
  }

  if (response.status !== "200") {
    console.error("Request failed:", response.status);
    // Try to print structured error info
    const errBody = response.body;
    if (errBody?.error) {
      console.error("Error code:", errBody.error.code);
      console.error("Message:", errBody.error.message);
      if (Array.isArray(errBody.error.details)) {
        console.error("Details:");
        for (const d of errBody.error.details) {
          console.error(" -", JSON.stringify(d, null, 2));
        }
      }
    } else {
      console.error("Raw body:", errBody);
    }
    process.exit(1);
  }

  const choice = response.body.choices?.[0];
  if (!choice) {
    console.warn("No choices returned.");
    return;
  }

  // Some SDK responses store content as an array of parts
  const parts = choice.message?.content;
  if (Array.isArray(parts)) {
    const textOutput = parts
      .filter(p => p.type === "text" && p.text)
      .map(p => p.text)
      .join("\n");
    console.log(textOutput || "No text parts found.");
  } else if (typeof parts === "string") {
    console.log(parts);
  } else {
    console.log("Unexpected content format:", parts);
  }
}

run().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});