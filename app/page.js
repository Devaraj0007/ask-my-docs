import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Ask My Docs — Production RAG System',
  description: 'AI-powered document Q&A with hybrid retrieval, reranking, and citations',
};

export default function Home() {
  redirect('/index.html');
}
