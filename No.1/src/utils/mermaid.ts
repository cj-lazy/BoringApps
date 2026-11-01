let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;

export const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      return mermaid;
    }).catch(error => {
      mermaidPromise = null;
      throw error;
    });
  }

  return mermaidPromise;
};
