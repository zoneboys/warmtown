# 暖湾小镇：资产合同

## 目录

```text
public/assets/
  characters/       # 玩家、NPC、可换装角色
  world/            # 房屋、道路、河流、山体、云层
  creatures/        # 外星生物
  flora/            # 树木、草、花、晶体植物
  environments/     # 天空、远景、雾、环境套件
  vfx/              # 水花、尘埃、星尘和交互特效
  video/            # 设计视频和展示视频，不作为运行时依赖
```

## 通用 GLB 要求

- 格式：glTF 2.0 Binary，应用变换，Y-up 导出，单位按项目现有比例校准。
- 每个资产必须有唯一稳定 ID、用途、来源、版本和回退方案。
- 近景资产使用 PBR base color、normal、roughness、AO；贴图尺寸按屏幕占用控制，禁止无理由使用超大贴图。
- 网格名称表达用途；碰撞代理以 `COL_` 开头，LOD 以 `LOD0`、`LOD1`、`LOD2` 命名。
- 角色动画名称固定为 `Idle`、`Walk`、`Run`、`Interact`；生物按同样规则命名可用动作。
- 根节点保持稳定 pivot。房屋节点必须保留 `ExteriorShell`、`InteriorShell`、`Door_Airlock`、`CameraCutaway` 和家具锚点。
- 资产生成、Blender 清理和游戏接入分开保存。生成结果先进入 `staging/`，通过检查后才覆盖 `public/assets/`。

## 预算建议

| 类型 | 近景三角形 | 贴图 | 运行时要求 |
| --- | ---: | ---: | --- |
| 玩家角色 | 30k-80k | 2k-4k | 骨骼、至少 4 个动作、阴影 |
| 主要生物 | 20k-60k | 2k-4k | 待机与移动、碰撞代理 |
| 房屋 Hero | 30k-100k | 2k-4k | 内外结构一致、剖切、家具锚点 |
| 植物 Hero | 8k-35k | 1k-2k | 3 个变体、风动画或 shader |
| 远景环境 | 5k-30k | 1k-2k | LOD、低成本阴影或无阴影 |

预算是起始检查线，不是为了牺牲可读性；最终以浏览器下载大小、帧率和视觉检查为准。

## OhMyGame 资产提示词模板

```text
Create an original game-ready GLB asset for Warmtown's alien pastel world.
Use a continuous modeled surface, readable silhouette, PBR materials, clean
UVs, stable root pivot, and named nodes. Do not use a primitive assembly as
the final close-up model. Include the requested animations and a simple COL_
proxy when the asset is interactive. Keep the asset within the Warmtown asset
contract and provide a low-detail fallback or LOD when it is used repeatedly.
```

生成后的 GLB 必须经过 Blender 5.2 清理、命名、尺度校准和浏览器加载检查；不能把生成服务的结果直接当作最终品质。
