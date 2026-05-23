# Leverage_Resolver

## 项目介绍

Leverage_Resolver 是基于 ScrollBoard 项目(https://github.com/ThinkSpiritLab/ScrollBoard)的滚榜动画解析器，用于展示从 Leverage 导出的比赛信息。
Leverage_Resolver 相较于原版优化了一血逻辑，增加了隐藏用户名功能，同时改进了UI使得其更贴近 ICPC Tools - Resolver。
虽然这一点未经证实，但 Leverage_Resolver 应该不兼容其他任何OJ的导出数据。

> 滚榜动画

Demo : 待施工

## 操作方法

加载数据有两种方式：

+ 通过 “加载数据” 按钮选择 json 文件。
+ 在 URL 参数中加上数据文件 URL，例如 
    
    ?data-url=https://thinkspiritlab.github.io/ScrollBoard/data/test.json

运行时操作

+ 鼠标单击或按 Enter 进行下一步。
+ 按 p 切换自动运行模式。
+ 按 + 和 - 增减速度因子
+ 按 ctrl 以较大步长改变速度因子

## 开发

```shell 
git clone https://github.com/Twoliges/Leverage_Resolver.git
pnpm install 
pnpm start
```

原项目用的是 yarn，但是不影响，npm 也行。
