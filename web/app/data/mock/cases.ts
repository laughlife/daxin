import type { CaseRecord, CaseType } from '../../types/content'

/**
 * TRO 案件查询 Mock 数据
 *
 * 重要：以下全部为演示数据——案件号、品牌、律所均为虚构占位，
 * 不对应任何真实法律案件；正式数据未来通过 Laravel API 替换本仓库层。
 * “近 3 天”使用固定 isRecent 标记，不依赖系统时间，避免 SSR 水合不一致。
 */

/** 案件类型展示映射 */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  trademark: '商标',
  patent: '专利',
  copyright: '版权'
}

/** 案件查询页固定提示文案 */
export const MOCK_DATA_NOTICE = '当前为本地 Mock 数据，尚未连接真实案件数据库。'

type CaseSeed = Omit<CaseRecord, 'slug' | 'category'>

const caseSeeds: CaseSeed[] = [
  {
    id: 'case-01',
    caseNumber: 'MOCK-25-cv-9001',
    filedAt: '2025-09-28',
    lawFirm: '演示律所 Alpha',
    plaintiffBrand: 'SnowFox Outdoor（演示）',
    state: '伊利诺伊州',
    caseType: 'trademark',
    status: '进行中',
    summary: '演示案件：原告主张户外运动类目商标侵权，申请临时限制令（TRO），处于应诉与和解评估窗口期。',
    tags: ['商标侵权', '和解窗口期', '亚马逊店铺冻结'],
    isRecent: true
  },
  {
    id: 'case-02',
    caseNumber: 'MOCK-25-cv-9002',
    filedAt: '2025-09-27',
    lawFirm: '演示律所 Beta',
    plaintiffBrand: 'AuroraLeaf Home（演示）',
    state: '加利福尼亚州',
    caseType: 'copyright',
    status: '进行中',
    summary: '演示案件：家居图案版权侵权批量诉讼，涉及多个跨境卖家店铺，资金冻结金额待确认。',
    tags: ['版权侵权', '批量诉讼'],
    isRecent: true
  },
  {
    id: 'case-03',
    caseNumber: 'MOCK-25-cv-9003',
    filedAt: '2025-09-26',
    lawFirm: '演示律所 Gamma',
    plaintiffBrand: 'IronPaw Tools（演示）',
    state: '纽约州',
    caseType: 'patent',
    status: '待开庭',
    summary: '演示案件：外观专利侵权指控，原告请求禁令与赔偿，被告方可提交不侵权抗辩材料。',
    tags: ['外观专利', '禁令风险'],
    isRecent: true
  },
  {
    id: 'case-04',
    caseNumber: 'MOCK-25-cv-9004',
    filedAt: '2025-09-25',
    lawFirm: '演示律所 Alpha',
    plaintiffBrand: 'LumiPet（演示）',
    state: '得克萨斯州',
    caseType: 'trademark',
    status: '和解中',
    summary: '演示案件：宠物用品商标纠纷，双方已进入和解谈判阶段，演示和解金额区间流程。',
    tags: ['商标侵权', '和解谈判'],
    isRecent: true
  },
  {
    id: 'case-05',
    caseNumber: 'MOCK-25-cv-9005',
    filedAt: '2025-09-20',
    lawFirm: '演示律所 Delta',
    plaintiffBrand: 'VerdeKitchen（演示）',
    state: '佛罗里达州',
    caseType: 'copyright',
    status: '进行中',
    summary: '演示案件：厨房用品图片与文案版权索赔，涉及平台链接下架与店铺资金冻结。',
    tags: ['版权侵权', '链接下架'],
    isRecent: false
  },
  {
    id: 'case-06',
    caseNumber: 'MOCK-25-cv-9006',
    filedAt: '2025-09-18',
    lawFirm: '演示律所 Beta',
    plaintiffBrand: 'NorthGale Sports（演示）',
    state: '伊利诺伊州',
    caseType: 'trademark',
    status: '缺席判决风险',
    summary: '演示案件：被告未按时应诉，存在缺席判决风险，演示应诉期限提醒场景。',
    tags: ['商标侵权', '应诉期限'],
    isRecent: false
  },
  {
    id: 'case-07',
    caseNumber: 'MOCK-25-cv-9007',
    filedAt: '2025-09-15',
    lawFirm: '演示律所 Epsilon',
    plaintiffBrand: 'CopperBird Lighting（演示）',
    state: '加利福尼亚州',
    caseType: 'patent',
    status: '进行中',
    summary: '演示案件：LED 灯具实用新型专利侵权指控，原告同时发起平台投诉与联邦诉讼。',
    tags: ['专利侵权', '平台投诉'],
    isRecent: false
  },
  {
    id: 'case-08',
    caseNumber: 'MOCK-25-cv-9008',
    filedAt: '2025-09-12',
    lawFirm: '演示律所 Gamma',
    plaintiffBrand: 'MistyGarden（演示）',
    state: '华盛顿州',
    caseType: 'copyright',
    status: '已和解',
    summary: '演示案件：园艺插画版权纠纷以和解结案，演示和解后资金解冻流程说明。',
    tags: ['版权侵权', '已和解'],
    isRecent: false
  },
  {
    id: 'case-09',
    caseNumber: 'MOCK-25-cv-9009',
    filedAt: '2025-09-10',
    lawFirm: '演示律所 Alpha',
    plaintiffBrand: 'SteelHorn Auto（演示）',
    state: '得克萨斯州',
    caseType: 'trademark',
    status: '进行中',
    summary: '演示案件：汽车配件类目商标维权，原告主张多枚注册商标，卖家需核对销售记录。',
    tags: ['商标侵权', '多商标主张'],
    isRecent: false
  },
  {
    id: 'case-10',
    caseNumber: 'MOCK-25-cv-9010',
    filedAt: '2025-09-08',
    lawFirm: '演示律所 Delta',
    plaintiffBrand: 'PaperTrail Studio（演示）',
    state: '纽约州',
    caseType: 'copyright',
    status: '待开庭',
    summary: '演示案件：文具设计版权索赔，涉及独立站与亚马逊双渠道链接。',
    tags: ['版权侵权', '独立站'],
    isRecent: false
  },
  {
    id: 'case-11',
    caseNumber: 'MOCK-25-cv-9011',
    filedAt: '2025-09-05',
    lawFirm: '演示律所 Epsilon',
    plaintiffBrand: 'GoldenKnot Jewelry（演示）',
    state: '加利福尼亚州',
    caseType: 'patent',
    status: '进行中',
    summary: '演示案件：首饰结构专利侵权诉讼，演示专利无效宣告程序的应对说明。',
    tags: ['专利侵权', '无效宣告'],
    isRecent: false
  },
  {
    id: 'case-12',
    caseNumber: 'MOCK-25-cv-9012',
    filedAt: '2025-09-02',
    lawFirm: '演示律所 Beta',
    plaintiffBrand: 'BlueHarbor Travel（演示）',
    state: '佛罗里达州',
    caseType: 'trademark',
    status: '已和解',
    summary: '演示案件：旅行用品商标纠纷和解结案，演示分期和解方案的记录方式。',
    tags: ['商标侵权', '分期和解'],
    isRecent: false
  },
  {
    id: 'case-13',
    caseNumber: 'MOCK-25-cv-9013',
    filedAt: '2025-08-28',
    lawFirm: '演示律所 Gamma',
    plaintiffBrand: 'FernWave Apparel（演示）',
    state: '伊利诺伊州',
    caseType: 'copyright',
    status: '进行中',
    summary: '演示案件：服装印花图案版权批量维权，被告卖家数量较多，演示批量应诉分组。',
    tags: ['版权侵权', '批量应诉'],
    isRecent: false
  },
  {
    id: 'case-14',
    caseNumber: 'MOCK-25-cv-9014',
    filedAt: '2025-08-25',
    lawFirm: '演示律所 Alpha',
    plaintiffBrand: 'OakForge Furniture（演示）',
    state: '得克萨斯州',
    caseType: 'patent',
    status: '缺席判决',
    summary: '演示案件：家具外观专利纠纷被告缺席，法院作出缺席判决，演示判决后救济途径说明。',
    tags: ['外观专利', '缺席判决'],
    isRecent: false
  },
  {
    id: 'case-15',
    caseNumber: 'MOCK-25-cv-9015',
    filedAt: '2025-08-20',
    lawFirm: '演示律所 Delta',
    plaintiffBrand: 'SilkRoute Textile（演示）',
    state: '加利福尼亚州',
    caseType: 'trademark',
    status: '进行中',
    summary: '演示案件：纺织品商标侵权与不正当竞争合并主张，演示复合诉因的应对思路。',
    tags: ['商标侵权', '不正当竞争'],
    isRecent: false
  },
  {
    id: 'case-16',
    caseNumber: 'MOCK-25-cv-9016',
    filedAt: '2025-08-15',
    lawFirm: '演示律所 Epsilon',
    plaintiffBrand: 'ClearDew Beauty（演示）',
    state: '纽约州',
    caseType: 'copyright',
    status: '已和解',
    summary: '演示案件：美妆素材版权纠纷和解结案，演示和解协议要点清单。',
    tags: ['版权侵权', '和解要点'],
    isRecent: false
  },
  {
    id: 'case-17',
    caseNumber: 'MOCK-25-cv-9017',
    filedAt: '2025-08-10',
    lawFirm: '演示律所 Beta',
    plaintiffBrand: 'WindMill Toys（演示）',
    state: '华盛顿州',
    caseType: 'trademark',
    status: '进行中',
    summary: '演示案件：玩具类目商标维权，叠加 CPSC 合规风险提示（演示场景）。',
    tags: ['商标侵权', 'CPSC 关联'],
    isRecent: false
  },
  {
    id: 'case-18',
    caseNumber: 'MOCK-25-cv-9018',
    filedAt: '2025-08-05',
    lawFirm: '演示律所 Gamma',
    plaintiffBrand: 'EmberCraft Tools（演示）',
    state: '伊利诺伊州',
    caseType: 'patent',
    status: '待开庭',
    summary: '演示案件：工具类发明专利侵权诉讼，演示证据开示（Discovery）阶段说明。',
    tags: ['发明专利', '证据开示'],
    isRecent: false
  },
  {
    id: 'case-19',
    caseNumber: 'MOCK-25-cv-9019',
    filedAt: '2025-07-28',
    lawFirm: '演示律所 Alpha',
    plaintiffBrand: 'HalcyonNest（演示）',
    state: '加利福尼亚州',
    caseType: 'copyright',
    status: '进行中',
    summary: '演示案件：家居摄影作品版权索赔，演示图片授权链核查流程。',
    tags: ['版权侵权', '授权链核查'],
    isRecent: false
  },
  {
    id: 'case-20',
    caseNumber: 'MOCK-25-cv-9020',
    filedAt: '2025-07-20',
    lawFirm: '演示律所 Delta',
    plaintiffBrand: 'TerraStride Shoes（演示）',
    state: '得克萨斯州',
    caseType: 'trademark',
    status: '已和解',
    summary: '演示案件：鞋类商标纠纷和解结案，演示店铺解冻与后续合规建议。',
    tags: ['商标侵权', '店铺解冻'],
    isRecent: false
  },
  {
    id: 'case-21',
    caseNumber: 'MOCK-25-cv-9021',
    filedAt: '2025-07-12',
    lawFirm: '演示律所 Epsilon',
    plaintiffBrand: 'FrostLine Cooling（演示）',
    state: '佛罗里达州',
    caseType: 'patent',
    status: '进行中',
    summary: '演示案件：制冷设备专利侵权指控，演示现有技术抗辩材料准备说明。',
    tags: ['专利侵权', '现有技术抗辩'],
    isRecent: false
  },
  {
    id: 'case-22',
    caseNumber: 'MOCK-25-cv-9022',
    filedAt: '2025-07-05',
    lawFirm: '演示律所 Beta',
    plaintiffBrand: 'MeadowLoop（演示）',
    state: '纽约州',
    caseType: 'trademark',
    status: '待开庭',
    summary: '演示案件：饰品品牌商标纠纷，原告申请初步禁令，演示禁令听证流程。',
    tags: ['商标侵权', '初步禁令'],
    isRecent: false
  },
  {
    id: 'case-23',
    caseNumber: 'MOCK-25-cv-9023',
    filedAt: '2025-06-26',
    lawFirm: '演示律所 Gamma',
    plaintiffBrand: 'QuartzHill Watch（演示）',
    state: '华盛顿州',
    caseType: 'copyright',
    status: '已和解',
    summary: '演示案件：腕表表盘设计版权纠纷和解结案，演示结案归档信息结构。',
    tags: ['版权侵权', '结案归档'],
    isRecent: false
  }
]

/** 完整 Mock 案件列表（slug 与分类由种子数据派生） */
export const mockCases: CaseRecord[] = caseSeeds.map(seed => ({
  ...seed,
  category: `${CASE_TYPE_LABELS[seed.caseType]}侵权`,
  slug: seed.caseNumber.toLowerCase()
}))

/** 按 id 查找 Mock 案件 */
export function findMockCaseById(id: string): CaseRecord | undefined {
  return mockCases.find(item => item.id === id || item.slug === id)
}

/** 起诉州选项（从 Mock 数据派生，保持稳定排序） */
export const mockCaseStates: string[] = Array.from(
  new Set(mockCases.map(item => item.state))
).sort((a, b) => a.localeCompare(b, 'zh-CN'))

/** 代理律所选项（从 Mock 数据派生） */
export const mockCaseLawFirms: string[] = Array.from(
  new Set(mockCases.map(item => item.lawFirm))
).sort((a, b) => a.localeCompare(b, 'zh-CN'))
