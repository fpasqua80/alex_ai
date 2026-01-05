import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { emitAnalysisCompleted, emitAnalysisFailed, emitAnalysisStarted } from '../lib/events';
import Head from 'next/head';

interface Agent {
  icon: string;
  name: string;
  role: string;
  description: string;
  color: string;
  bgColor: string;
}

interface AnalysisProgress {
  stage: 'idle' | 'starting' | 'planner' | 'parallel' | 'completing' | 'complete' | 'error';
  message: string;
  activeAgents: string[];
  error?: string;
}

const agents: Agent[] = [
  {
    icon: '🎯',
    name: 'Financial Planner',
    role: 'Orchestrator',
    description: 'Coordinates your financial analysis',
    color: 'text-ai-accent',
    bgColor: 'bg-ai-accent'
  },
  {
    icon: '📊',
    name: 'Portfolio Analyst',
    role: 'Reporter',
    description: 'Analyzes your holdings and performance',
    color: 'text-primary',
    bgColor: 'bg-primary'
  },
  {
    icon: '📈',
    name: 'Chart Specialist',
    role: 'Charter',
    description: 'Visualizes your portfolio composition',
    color: 'text-green-600',
    bgColor: 'bg-green-600'
  },
  {
    icon: '🎯',
    name: 'Retirement Planner',
    role: 'Retirement',
    description: 'Projects your retirement readiness',
    color: 'text-accent',
    bgColor: 'bg-accent'
  }
];

export default function AdvisorTeam() {
  const router = useRouter();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress>({
    stage: 'idle',
    message: '',
    activeAgents: []
  });

  const startAnalysis = async () => {
    setIsAnalyzing(true);

    // Generate a local "analysis id" just to keep UI/events compatible.
    // (Your backend currently has no /api/jobs or /api/analyze endpoints.)
    const localJobId = `local_${Date.now()}`;

    try {
      emitAnalysisStarted(localJobId);

      setProgress({
        stage: 'starting',
        message: 'Initializing analysis.',
        activeAgents: []
      });

      // Planner stage
      setTimeout(() => {
        setProgress({
          stage: 'planner',
          message: 'Financial Planner coordinating analysis.',
          activeAgents: ['Financial Planner']
        });
      }, 800);

      // Parallel stage
      setTimeout(() => {
        setProgress({
          stage: 'parallel',
          message: 'Agents working in parallel.',
          activeAgents: ['Portfolio Analyst', 'Chart Specialist', 'Retirement Planner']
        });
      }, 2400);

      // Completing stage
      setTimeout(() => {
        setProgress({
          stage: 'completing',
          message: 'Finalizing insights and recommendations.',
          activeAgents: ['Financial Planner']
        });
      }, 4200);

      // Complete
      setTimeout(() => {
        setProgress({
          stage: 'complete',
          message: 'Analysis complete!',
          activeAgents: []
        });

        emitAnalysisCompleted(localJobId);

        // Navigate to analysis page (no job_id since backend doesn't support it)
        setTimeout(() => {
          router.push('/analysis');
        }, 800);
      }, 5600);
    } catch (error) {
      console.error('Error starting analysis:', error);
      emitAnalysisFailed(localJobId, error instanceof Error ? error.message : 'Unknown error');

      setProgress({
        stage: 'error',
        message: 'Failed to start analysis',
        activeAgents: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      setIsAnalyzing(false);
    }
  };

  const isAgentActive = (agentName: string) => progress.activeAgents.includes(agentName);

  return (
    <>
      <Head>
        <title>Advisor Team - Alex AI Financial Advisor</title>
      </Head>
      <Layout>
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-lg shadow px-8 py-6 mb-8">
              <h1 className="text-3xl font-bold text-dark mb-2">Your AI Advisory Team</h1>
              <p className="text-gray-600">
                Meet your team of specialized AI agents that work together to provide comprehensive financial analysis.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className={`bg-white rounded-lg shadow-lg p-6 relative overflow-hidden transition-all duration-300 ${
                    isAgentActive(agent.name) ? 'transform -translate-y-1 shadow-xl ring-4 ring-ai-accent ring-opacity-50' : ''
                  }`}
                >
                  {isAgentActive(agent.name) && (
                    <div className="absolute inset-0 bg-gradient-to-br from-ai-accent/20 to-transparent animate-strong-pulse" />
                  )}
                  <div className="relative">
                    <div className={`text-5xl mb-4 ${isAgentActive(agent.name) ? 'animate-strong-pulse' : ''}`}>{agent.icon}</div>
                    <h3 className={`text-xl font-semibold mb-1 ${agent.color}`}>{agent.name}</h3>
                    <p className="text-sm text-gray-500 mb-3">{agent.role}</p>
                    <p className="text-gray-600 text-sm">{agent.description}</p>
                    {isAgentActive(agent.name) && (
                      <div className={`mt-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white ${agent.bgColor} animate-strong-pulse`}>
                        <span className="mr-2">●</span>
                        Active
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg shadow px-8 py-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-dark">Analysis Center</h2>
                <button
                  onClick={startAnalysis}
                  disabled={isAnalyzing}
                  className={`px-8 py-4 rounded-lg font-semibold text-white transition-all ${
                    isAnalyzing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-ai-accent hover:bg-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  }`}
                >
                  {isAnalyzing ? 'Analysis in Progress.' : 'Start New Analysis'}
                </button>
              </div>

              {isAnalyzing && (
                <div className="mb-8 p-6 bg-gradient-to-r from-ai-accent/10 to-primary/10 rounded-lg border border-ai-accent/20">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-dark">Analysis Progress</h3>
                    {progress.stage !== 'error' && progress.stage !== 'complete' && (
                      <div className="flex space-x-2">
                        <div className="w-3 h-3 bg-ai-accent rounded-full animate-strong-pulse" />
                        <div className="w-3 h-3 bg-ai-accent rounded-full animate-strong-pulse" style={{ animationDelay: '0.5s' }} />
                        <div className="w-3 h-3 bg-ai-accent rounded-full animate-strong-pulse" style={{ animationDelay: '1s' }} />
                      </div>
                    )}
                  </div>

                  <p className={`text-sm mb-4 ${progress.stage === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                    {progress.message}
                  </p>

                  {progress.stage === 'error' && progress.error && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">{progress.error}</p>
                      <button
                        onClick={() => {
                          setIsAnalyzing(false);
                          setProgress({ stage: 'idle', message: '', activeAgents: [] });
                        }}
                        className="mt-3 text-sm font-semibold text-red-700 hover:text-red-800"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {progress.stage === 'complete' && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">Redirecting to your report…</p>
                    </div>
                  )}
                </div>
              )}

              {!isAnalyzing && (
                <div className="text-gray-600">
                  <p className="mb-3">
                    Your current backend (localhost:8000) does not expose <code>/api/jobs</code> or <code>/api/analyze</code>.
                    This page runs a local (client-side) analysis flow and then opens the report page.
                  </p>
                  <p className="text-sm text-gray-500">
                    If you later add server-side analysis endpoints, we can wire this page back to real jobs/progress.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}
