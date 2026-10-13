export interface QrAssetImage {
  itemKey: string
  imageUrl: string
}

/** All non-footer surfaces use these four independently managed QR assets. */
export const QR_ASSET_KEY_BY_CHANNEL = {
  'tro-public': 'qr-tro-public',
  'labor-public': 'qr-labor-public',
  'tro-consult': 'qr-tro-consult',
  'labor-consult': 'qr-labor-consult',
} as const

export function qrImageForItemKey(items: readonly QrAssetImage[] | undefined, itemKey: string): string {
  return items?.find(item => item.itemKey === itemKey)?.imageUrl.trim() ?? ''
}

export function qrSourcesFromAssets(items: readonly QrAssetImage[] | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(QR_ASSET_KEY_BY_CHANNEL).map(([channelId, itemKey]) => [
    channelId,
    qrImageForItemKey(items, itemKey),
  ]))
}
