// The few Chrome APIs used so far, so we don't need @types/chrome. Extend as later steps need more.
declare namespace chrome {
  namespace tabs {
    interface Tab { id?: number; url?: string; title?: string }
    function query(info: { active: boolean; currentWindow: boolean }): Promise<Tab[]>
    function create(props: { url: string }): Promise<Tab>
  }
}
