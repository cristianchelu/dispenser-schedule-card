declare global {
  interface Window {
    loadCardHelpers: () => Promise<{
      createRowElement: (config: any) => HTMLElement;
      createCardElement: (config: any) => HTMLElement;
    }>;
    customCards?: Array<{
      type: string;
      name: string;
      description?: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }
}

export {};
