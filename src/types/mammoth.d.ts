declare module 'mammoth/mammoth.browser' {
  export interface ExtractRawTextResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractRawTextResult>
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractRawTextResult>

  const mammoth: {
    extractRawText: typeof extractRawText
    convertToHtml: typeof convertToHtml
  }

  export default mammoth
}
