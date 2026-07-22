import "dotenv/config";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

async function main() {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-embedding-2",
  });

  const result = await embeddings.embedQuery("Hello World");

  console.log(result.length);
}

main().catch(console.error);