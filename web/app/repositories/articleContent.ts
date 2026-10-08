import richContent from '../data/legacy/rich-content.json'

/** 正文读取层；未来接口保持相同字段，并在服务端完成富文本清洗。 */
export interface ArticleContent {
  html: string
  images: string[]
}

const localContent: Record<string, ArticleContent> = richContent

export function findArticleContent(sourceId: number | undefined): ArticleContent | undefined {
  return sourceId === undefined ? undefined : localContent[String(sourceId)]
}
