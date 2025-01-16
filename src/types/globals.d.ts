declare global {
  interface Window {
    loadCardHelpers: () => Promise<{
      createRowElement: (config: any) => HTMLElement;
    }>;
  }
}

export {};
