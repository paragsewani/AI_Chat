import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';

const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },

  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);

    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
});

const app = express();

app.use(cors());
app.use(express.json());

const llm = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-flash-latest',
  temperature: 0.2,
});

app.get('/', (req, res) => {
  return res.json({
    status: 'All Good!',
  });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF uploaded.',
      });
    }

    await queue.add(
      'file-ready',
      JSON.stringify({
        filename: req.file.originalname,
        destination: req.file.destination,
        path: req.file.path,
      })
    );

    return res.json({
      success: true,
      message: 'uploaded',
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Upload failed.',
      error: error.message,
    });
  }
});

app.get('/chat', async (req, res) => {
  try {
    const userQuery = req.query.message;

    if (!userQuery) {
      return res.status(400).json({
        success: false,
        message: 'message query parameter is required.',
      });
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-embedding-2",
    });

    const vectorStore =
      await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url: 'http://localhost:6333',
          collectionName: 'langchainjs-testing',
        }
      );

    const retriever = vectorStore.asRetriever({
      k: 2,
    });

    const docs = await retriever.invoke(userQuery);

    const SYSTEM_PROMPT = `
You are a helpful AI Assistant.

Answer the user's question ONLY using the provided PDF context.

If the answer is not available in the context, reply that the information is not present in the PDF.

Context:
${docs.map((doc) => doc.pageContent).join('\n\n')}
`;

    const response = await llm.invoke([
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userQuery,
      },
    ]);

    return res.json({
      success: true,
      message: response.content,
      docs,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate response.',
      error: error.message,
    });
  }
});

app.listen(8000, () => {
  console.log('Server started on PORT:8000');
});