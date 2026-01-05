// API configuration for Vercel + FastAPI (same domain in production)
//
// - Local dev: backend normalmente roda em http://localhost:8000 (docker/uvicorn)
// - Produção (Vercel): use URLs relativas, pois o backend também está no mesmo domínio em /api/*
export const getApiUrl = () => {
  // Client-side
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:8000';
    }
    // Production (same domain): use relative base URL
    return '';
  }

  // Server-side (SSR / build)
  // Em desenvolvimento, algumas chamadas podem rodar no server do Next;
  // aponte para o backend local para evitar requests indo para localhost:3000/api (inexistente).
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8000';
  }

  return '';
};

export const API_URL = getApiUrl();
