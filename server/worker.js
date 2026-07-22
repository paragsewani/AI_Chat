import 'dotenv/config';

import { Worker } from 'bullmq';

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';

const worker = new Worker(
  'file-upload-queue',

  async (job) => {
    try {
      console.log('Job Received:', job.data);

      const data = JSON.parse(job.data);

      /*
        1. Load PDF
        2. Split into chunks
        3. Generate Gemini embeddings
        4. Store inside Qdrant
      */

      const loader = new PDFLoader(data.path);

      const docs = await loader.load();

console.log("Docs length:", docs.length);
console.log(docs);

      const splitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await splitter.splitDocuments(docs);

      console.log(
        `Split ${docs.length} document(s) into ${splitDocs.length} chunks`
      );

      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        model: 'gemini-embedding-2',
      });

      const vectorStore =
        await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            url: 'http://localhost:6333',
            collectionName: 'langchainjs-testing',
          }
        );

      await vectorStore.addDocuments(splitDocs);

      console.log(
        `Successfully added ${splitDocs.length} chunks to Qdrant`
      );
    } catch (error) {
      console.error('Worker Error:', error);
    }
  },

  {
    concurrency: 100,

    connection: {
      host: 'localhost',
      port: 6379,
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed.`);
  console.error(err);
});

console.log('Worker started...');