<script setup lang="ts">import { ref } from "vue";
const classes = [
    [1, "肺不张", "Atelectasis"],
    [2, "心影扩大", "Cardiomegaly"],
    [3, "肺部实变", "Consolidation"],
    [4, "肺水肿", "Edema"],
    [5, "胸腔积液", "Effusion"],
    [6, "肺气肿", "Emphysema"],
    [7, "肺纤维化", "Fibrosis"],
    [8, "膈疝", "Hernia"],
    [9, "肺浸润", "Infiltration"],
    [10, "肺部肿块", "Mass"],
    [11, "肺结节", "Nodule"],
    [12, "胸膜增厚", "Pleural_Thickening"],
    [13, "肺炎", "Pneumonia"],
    [14, "气胸", "Pneumothorax"],
];
const faqs = [
    {
        question: "模型概率可以直接作为诊断结果吗？",
        answer: "不可以。概率表示模型对各类别的匹配程度，只能作为影像复核线索。最终结论需由具备资质的医生结合原始影像、病史、体征及其他检查作出。",
    },
    {
        question: "为什么一次检查可能出现多个类别？",
        answer: "本系统采用多标签分类，一次胸部X线检查可能同时提示多种影像表现。每个类别独立计算概率，不会强制只保留最高类别。",
    },
    {
        question: "智能助手会给出诊断或处方吗？",
        answer: "不会。助手可查询系统内检查、汇总模型发现、比较历史趋势并生成医生审阅草稿，但不会代替医生确诊，也不会生成药名、剂量、处方或具体治疗方案。",
    },
    {
        question: "患者编号会发送给大模型吗？",
        answer: "不会。患者编号、检查编号、患者身份信息及原始胸片仅在本地业务系统中使用；大模型只接收脱敏后的类别概率、检查时间和趋势摘要。",
    },
    {
        question: "页面阈值会改变原始概率吗？",
        answer: "不会。阈值只影响页面突出显示，数据库仍保存模型返回的14项原始概率。",
    },
    {
        question: "当前模型结果可以用于真实临床吗？",
        answer: "不可以。本系统使用 NIH 公开科研数据的子集训练，只适合学习、科研和演示，尚未经过临床验证或医疗器械审批。",
    },
];
const openedFaq = ref<number | null>(0);
</script>

<template>
  <section>
    <header class="page-heading">
      <div>
        <p class="page-eyebrow">PRODUCT GUIDE</p>
        <h1>系统说明</h1>
        <p>了解产品用途、标准操作流程、结果含义和安全边界。</p>
      </div>
      <div class="heading-actions">
        <RouterLink class="button" to="/assistant">进入影像助手</RouterLink>
        <RouterLink class="button button--primary" to="/studies/new">新建检查</RouterLink>
      </div>
    </header>

    <div class="about-hero">
      <span>CHEST X-RAY ASSISTED SCREENING · v0.1.0</span>
      <h2>
        胸部X线多标签
        <br />
        智能辅助筛查平台
      </h2>
      <p>
        面向胸部X线检查的标准化管理与辅助分析，将检查建档、多图分析、结果复核、历史对比和数据导出集中在同一工作台。系统输出用于帮助专业人员整理和复核影像信息，不作为独立诊断结论。
      </p>
      <div>
        <b>检查管理</b>
        <b>多标签筛查</b>
        <b>历史对比</b>
        <b>医生审阅</b>
      </div>
    </div>

    <div class="about-workflow">
      <article>
        <span>01</span>
        <strong>建立检查</strong>
        <small>录入患者与检查编号</small>
      </article>
      <i>→</i>
      <article>
        <span>02</span>
        <strong>导入胸片</strong>
        <small>核对方向、姿势与图像质量</small>
      </article>
      <i>→</i>
      <article>
        <span>03</span>
        <strong>辅助分析</strong>
        <small>生成十四类概率与重点提示</small>
      </article>
      <i>→</i>
      <article>
        <span>04</span>
        <strong>专业复核</strong>
        <small>结合原片、病史与临床资料</small>
      </article>
      <i>→</i>
      <article>
        <span>05</span>
        <strong>结果留存</strong>
        <small>查看记录或导出分析结果</small>
      </article>
    </div>

    <div class="about-layout">
      <div class="content-stack">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>产品定位</h2>
              <p>适用场景与预期使用者</p>
            </div>
            <span class="record-status record-status--completed">辅助工具</span>
          </div>
          <div class="about-use-grid">
            <div>
              <span>01</span>
              <strong>检查工作台</strong>
              <p>按患者和检查组织胸片、推理结果与创建时间，便于统一查询和回顾。</p>
            </div>
            <div>
              <span>02</span>
              <strong>影像辅助筛查</strong>
              <p>对十四类胸部影像表现分别给出概率，帮助阅片人员快速定位需要重点复核的项目。</p>
            </div>
            <div>
              <span>03</span>
              <strong>智能审阅助手</strong>
              <p>汇总当前检查与历史变化，生成结构化复核要点，降低信息整理成本。</p>
            </div>
            <div>
              <span>04</span>
              <strong>批量处理与导出</strong>
              <p>支持批量分析、结构化结果生成、数据校验与文件下载。</p>
            </div>
          </div>
          <p class="about-copy">
            本系统面向具备相关专业背景的授权人员，用于影像信息整理与辅助复核；不面向患者提供自助诊断。
          </p>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>如何理解分析结果</h2>
              <p>先看状态，再看概率，最后完成专业复核</p>
            </div>
          </div>
          <div class="about-result-guide">
            <div>
              <strong>检查状态</strong>
              <p>“已完成”表示系统成功保存推理结果，不代表已完成医生审核。</p>
            </div>
            <div>
              <strong>类别概率</strong>
              <p>数值越高表示模型匹配程度越高；概率不是患病概率，也不等同于确诊。</p>
            </div>
            <div>
              <strong>阈值提示</strong>
              <p>阈值只影响突出显示待复核类别，不会修改模型原始输出。</p>
            </div>
            <div>
              <strong>历史变化</strong>
              <p>智能助手可比较系统中同一患者的既往检查，但仍需核对检查条件与原始影像。</p>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>支持的影像类别</h2>
              <p>十个类别相互独立，同一次检查可同时出现多个提示</p>
            </div>
          </div>
          <div class="about-class-grid">
            <div v-for="item in classes" :key="item[0]">
              <span>{{ String(item[0]).padStart(2, "0") }}</span>
              <div>
                <strong>{{ item[1] }}</strong>
                <small>{{ item[2] }}</small>
              </div>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>数据与隐私</h2>
              <p>最小化使用、受控访问和脱敏传递</p>
            </div>
          </div>
          <div class="about-privacy-grid">
            <div>
              <strong>本地身份数据</strong>
              <p>患者编号和检查编号用于系统内关联，不向外部智能服务发送。</p>
            </div>
            <div>
              <strong>脱敏模型上下文</strong>
              <p>智能助手仅发送类别概率、时间和趋势摘要，不发送原始胸片和直接身份信息。</p>
            </div>
            <div>
              <strong>授权使用</strong>
              <p>仅处理已获得合法授权的数据，演示时优先使用脱敏或模拟数据。</p>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>常见问题</h2>
              <p>关于结果、助手与数据安全</p>
            </div>
          </div>
          <div class="about-faq">
            <div v-for="(item, index) in faqs" :key="item.question">
              <button
                type="button"
                :aria-expanded="openedFaq === index"
                @click="openedFaq = openedFaq === index ? null : index"
              >
                <span>{{ item.question }}</span>
                <b>{{ openedFaq === index ? "−" : "+" }}</b>
              </button>
              <p v-if="openedFaq === index">{{ item.answer }}</p>
            </div>
          </div>
        </article>

        <details class="panel about-technical-details">
          <summary>
            <span>
              <strong>版本与运行环境</strong>
              <small>供部署与维护人员查看</small>
            </span>
            <b>展开</b>
          </summary>
          <dl class="summary-list">
            <div>
              <dt>系统版本</dt>
              <dd>v0.1.0</dd>
            </div>
            <div>
              <dt>应用组成</dt>
              <dd>Web界面 · 业务服务 · 数据库 · 推理服务</dd>
            </div>
            <div>
              <dt>服务组件</dt>
              <dd>Vue · Express · MySQL · FastAPI</dd>
            </div>
            <div>
              <dt>推理模式</dt>
              <dd>已接入影像分析服务</dd>
            </div>
            <div>
              <dt>使用范围</dt>
              <dd>仅供功能验证与专业复核研究</dd>
            </div>
          </dl>
        </details>
      </div>

      <aside class="content-stack about-guide-aside">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>快速开始</h2>
              <p>完成一次标准检查</p>
            </div>
          </div>
          <ol class="about-checklist">
            <li>
              <span>1</span>
              <p>
                <strong>创建检查</strong>
                <small>使用去标识化的患者编号与唯一检查编号。</small>
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                <strong>上传并核对</strong>
                <small>确认图像属于同一次检查，格式和方向正确。</small>
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                <strong>查看结果</strong>
                <small>关注十四类完整概率及高于阈值的提示。</small>
              </p>
            </li>
            <li>
              <span>4</span>
              <p>
                <strong>完成复核</strong>
                <small>由专业人员结合原片和临床资料判断。</small>
              </p>
            </li>
          </ol>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>智能助手能力</h2>
              <p>选中患者检查后使用</p>
            </div>
          </div>
          <ul class="validation-list about-status">
            <li class="valid">✓ 汇总本次检查的模型发现</li>
            <li class="valid">✓ 标出需要重点复核的类别</li>
            <li class="valid">✓ 对比同一患者历史检查趋势</li>
            <li class="valid">✓ 生成医生审阅摘要草稿</li>
            <li class="valid">✓ 提示可进一步核对的临床信息</li>
            <li class="warning">! 不提供最终诊断、处方或治疗方案</li>
          </ul>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>当前功能状态</h2>
              <p>功能范围与使用限制</p>
            </div>
          </div>
          <dl class="summary-list">
            <div>
              <dt>检查与记录</dt>
              <dd>可用</dd>
            </div>
            <div>
              <dt>单次与批量流程</dt>
              <dd>可用</dd>
            </div>
            <div>
              <dt>结果导出</dt>
              <dd>支持生成与校验</dd>
            </div>
            <div>
              <dt>影像助手</dt>
              <dd>支持辅助问答</dd>
            </div>
            <div>
              <dt>影像分析服务</dt>
              <dd>影像分析服务</dd>
            </div>
            <div>
              <dt>解释图</dt>
              <dd>Grad-CAM关注区域</dd>
            </div>
          </dl>
        </article>

        <article class="about-warning">
          <strong>重要安全提示</strong>
          <p>
            当前版本尚未完成临床验证及相关合规评估，不得用于实际医疗决策。模型提示可能存在漏检或误报，不能替代医生阅片、诊断和治疗决策。出现急危重症疑虑时，应立即按正规医疗流程处理。
          </p>
        </article>
      </aside>
    </div>
  </section>
</template>
