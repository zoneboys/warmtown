# 暖湾小镇官网实施计划

## 目标与边界

保留一张独立的简体中文游戏介绍页面，源码位于 `website/`，访问路径为 `/website/`；根路径 `/` 仍是现有 Three.js 游戏。官网继续作为同一 Manus 托管项目里的独立静态页交付，不创建第二项目、不新增后端/数据库/账号或真实多人功能。

当前网站代码尚未发布。本次由于游戏玩法范围扩大，先完成游戏系统，再更新官网的功能说明；只有当页面描述与可玩内容一致、检查通过后，才保存新检查点。

## 架构与路由

- 复用 Vite 多页静态构建，不迁移框架、不新增依赖；将 `website/index.html` 保持为第二个构建入口，`pnpm build` 输出到 `dist/`。
- 官网正文静态写入 HTML，首屏无需 JavaScript 即可阅读；CSS 独立、响应式并遵循减少动态效果偏好。
- 保留 `/` 游戏路由并在 `public/manus-routes.json` 声明 `/website/`。为两页提供一致的 sitemap/robots 文档。
- 复用已经随附的 Noto Sans SC、Figtree、本机许可文件、游戏分享图与原创贝壳/小芽标识。沿用已生成的单张无文字海湾主视觉，不另做重复或不相关图片。
- 官网 canonical、Open Graph、Twitter 元数据使用既有正式来源 `https://warmtown-fuhmwuyq.manus.game/website/`。

## 内容与功能准确性

介绍海岛漫步、可自定义的原创拟人角色与服装、背包和交易、采集/种植/收获、垂钓、任务追踪、家园建造、代步车辆及跟随宠物。每项只在实际可玩并通过状态/界面实现后宣传。保留温和慢节奏与原创内容；不复制《心动小镇》的具体角色、场景、界面或素材。

页面明确当前为浏览器 3D 单机原型、进度保存在本机，尚无账号、真实在线多人、云端同步或排行榜；不要捏造发售日期、价格或多人上线承诺。提供可用的“回到小镇/进入游戏”链接和关于当前版本的 FAQ。

## 验收与发布

- 语义化、简体中文、无 JS 时仍有完整正文；包含有意义的 title/description、3–8 项 keywords、canonical、Open Graph 与 Twitter 元数据。
- 桌面与窄屏均可读、可键盘操作、焦点可见；动效支持 `prefers-reduced-motion`。
- 保留 `/` 游戏，并 HTTP 验证 `/website/`、官网主视觉、`/manus-routes.json`、`/sitemap.xml`、`/robots.txt`。
- 配合游戏的 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke` 通过后，再更新 canonical `main` 检查点。既有托管设置启用了 auto-publish，所以推送已检查的提交会更新同一公开站点 `/` 与 `/website/`；这不代表上线多人联机。
