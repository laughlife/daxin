interface ReadingArticle {
  href: string
  publishedAt: string
  source?: { articleId: number }
}

/** 栏目别名可以复用正文，但推荐区只展示同一来源一次。 */
export function selectReading<T extends ReadingArticle>(articles: T[], group: 'tro' | 'labor' | 'all', limit = 4): T[] {
  const seen = new Set<number>()
  return articles.filter(article => article.source && (group === 'all' || (group === 'tro'
    ? article.href.startsWith('/tro/') || article.href.startsWith('/faq/tro/')
    : article.href.startsWith('/domestic/') || article.href.startsWith('/faq/labor/'))))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter(article => {
      const id = article.source!.articleId
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }).slice(0, limit)
}
