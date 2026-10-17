/**
 * Add or replace a cache version on one known static asset URL.
 * Other URLs are returned unchanged so uploaded, configurable images keep their URL.
 *
 * @param {string} imageUrl
 * @param {string} assetPath
 * @param {string | number} version
 */
export function versionedAssetUrl(imageUrl, assetPath, version) {
  if (!imageUrl || !assetPath || version === undefined || version === null || version === '') {
    return imageUrl
  }

  const hashIndex = imageUrl.indexOf('#')
  const fragment = hashIndex >= 0 ? imageUrl.slice(hashIndex) : ''
  const resourceUrl = hashIndex >= 0 ? imageUrl.slice(0, hashIndex) : imageUrl
  const queryIndex = resourceUrl.indexOf('?')
  const path = queryIndex >= 0 ? resourceUrl.slice(0, queryIndex) : resourceUrl
  const query = queryIndex >= 0 ? resourceUrl.slice(queryIndex + 1) : ''

  if (path !== assetPath && !path.endsWith(assetPath)) return imageUrl

  const params = new URLSearchParams(query)
  params.set('v', String(version))
  return `${path}?${params.toString()}${fragment}`
}
