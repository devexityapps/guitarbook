// The few Chrome APIs used so far, so we don't need @types/chrome. Extend as later steps need more.
declare namespace chrome {
  namespace tabs {
    interface Tab { id?: number; url?: string; title?: string }
    function query(info: { active: boolean; currentWindow: boolean }): Promise<Tab[]>
    function create(props: { url: string }): Promise<Tab>
  }
  namespace runtime {
    const id: string
    function getURL(path: string): string
    interface MessageSender { id?: string; url?: string }
    function sendMessage(message: unknown): Promise<any>
    const onMessage: {
      addListener(
        callback: (message: any, sender: MessageSender, sendResponse: (response?: unknown) => void) => boolean | void,
      ): void
    }
  }
  namespace windows {
    interface Window { id?: number; type?: string }
    const onCreated: { addListener(cb: (window: Window) => void): void }
    function update(windowId: number, info: { focused?: boolean; drawAttention?: boolean }): Promise<Window>
  }
  namespace scripting {
    function executeScript<T>(injection: { target: { tabId: number }; func: () => T }): Promise<{ result?: T }[]>
  }
  namespace offscreen {
    function createDocument(params: { url: string; reasons: string[]; justification: string }): Promise<void>
    function closeDocument(): Promise<void>
  }
  namespace storage {
    interface Area {
      get(keys: string | string[]): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
    const local: Area
    const onChanged: {
      addListener(cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void): void
      removeListener(cb: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void): void
    }
  }
}
