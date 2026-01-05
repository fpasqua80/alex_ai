export const isDemoMode = () => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ALEX_DEMO_MODE") === "1";
  };
  
  export const enableDemoMode = () => {
    localStorage.setItem("ALEX_DEMO_MODE", "1");
  };
  
  export const disableDemoMode = () => {
    localStorage.removeItem("ALEX_DEMO_MODE");
  };
  