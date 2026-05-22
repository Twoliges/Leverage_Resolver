import "./Board.css";

import * as dto from "./dto";
import * as vo from "./vo";
import * as util from "./util";
import { useEventListener } from "./effects";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import FlipMove from "react-flip-move";
import { message } from "antd";
import { WomanOutlined } from "@ant-design/icons";

// ───── 工具函数 ─────

/** 获取题目泡泡内部显示文字 */
function getBubbleContent(problem: vo.ProblemState): string {
    switch (problem.state) {
        case vo.ProblemStateKind.Passed:
            return problem.info.score !== undefined
                ? String(problem.highestScore)
                : "\u2713"; // ✓
        case vo.ProblemStateKind.Failed:
            return String(problem.tryCount);
        case vo.ProblemStateKind.Pending:
            return "?";
        default:
            return "";
    }
}

/** 获取题目泡泡 CSS 类名 */
function getBubbleStateClass(problem: vo.ProblemState): string {
    switch (problem.state) {
        case vo.ProblemStateKind.Passed:
            return "state-passed";
        case vo.ProblemStateKind.Failed:
            return "state-failed";
        case vo.ProblemStateKind.Pending:
            return "state-pending";
        default:
            return "state-untouched";
    }
}

/** 根据名次获取奖牌色 */
function getMedalColor(
    idx: number,
    medalInfo?: { gold: number; silver: number; bronze: number }
): string | undefined {
    if (!medalInfo) return undefined;
    const rank = idx + 1; // visual position 0-based -> 1-based
    if (rank <= medalInfo.gold) return "#d4a72c"; // 金
    if (rank <= medalInfo.gold + medalInfo.silver) return "#8592a0"; // 银
    if (rank <= medalInfo.gold + medalInfo.silver + medalInfo.bronze) return "#a85c28"; // 铜
    return undefined;
}

function messageInfo(content: string): void {
    void message.info({ content, className: "info-message", duration: 0.4 });
}

// ───── 组件属性 ─────

interface BoardProps {
    data: dto.Contest;
    options: vo.BoardOptions;
}

// ───── Board 组件 ─────

const Board: React.FC<BoardProps> = ({ data, options }: BoardProps) => {

    const [state, setState] = useState<vo.ContestState>(
        useMemo(() => vo.calcContestState(data), [data])
    );

    const [highlightItem, setHighlightItem] = useState<vo.HighlightItem | null>(null);

    const revealGen = useRef<vo.RevealGen>(vo.reveal(state));

    const [highlightFlag, setHighlightFlag] = useState<boolean>(false);

    const [keyLock, setKeyLock] = useState<boolean>(false);

    const [autoReveal, setAutoReveal] = useState<boolean>(options.autoReveal);
    const [speedFactor, setSpeedFactor] = useState<number>(options.speedFactor);

    const [focusIndex, setFocusIndex] = useState<number>(state.cursor.focus);

    // ───── 核心：步入下一步 ─────
    const handleNextStep = useCallback(() => {
        console.log(new Date().getTime(), "handleNextStep");
        const prevCursorIdx = state.cursor.index;
        const item = revealGen.current.next();
        setFocusIndex(state.cursor.focus);

        // 光标变动 → 滚动到新队伍
        if (state.cursor.index !== prevCursorIdx && state.cursor.index >= 0) {
            const team = state.teamStates[state.cursor.index];
            const element = document.querySelector<HTMLDivElement>(
                `#team-id-${team.info.id}`
            );
            if (element) {
                const rect = element.getBoundingClientRect();
                window.scrollTo({
                    left: 0,
                    top: window.scrollY + rect.top - window.innerHeight / 2,
                    behavior: "smooth",
                });
            }
        }
        console.log("cursor index = ", state.cursor.index);

        if (!item.done) {
            if (item.value) {
                const value = item.value;
                void (async (): Promise<void> => {
                    console.log("reveal highlight");
                    setKeyLock(true);
                    console.log("locked");
                    setHighlightItem(value);

                    let delay: number;
                    delay = options.shiningBeforeReveal ? 600 : (autoReveal ? 200 : 0);
                    console.log("delay", delay / speedFactor);
                    await util.delay(delay / speedFactor); // 闪烁等待
                    handleNextStep();

                    delay = autoReveal ? (value.passed ? 500 : 200) : (0);
                    console.log("delay", delay / speedFactor);
                    await util.delay(delay / speedFactor); // 结果展示等待

                    const team = state.teamStates.find(
                        (t) => t.info.id === value.teamId
                    );
                    const prevRank = team?.rank;
                    handleNextStep();
                    const curRank = team?.rank;

                    if (prevRank !== curRank) {
                        delay = vo.FLIP_MOVE_DURATION;
                        console.log("delay", delay / speedFactor);
                        await util.delay(delay / speedFactor); // 排名动画等待
                    }

                    setKeyLock(false);
                    console.log("unlocked");
                })();
            } else {
                setHighlightItem(null);
            }
        } else {
            setHighlightItem(null);
        }
        setState({ ...state });
        return item.done;
    }, [state, speedFactor, options.shiningBeforeReveal, autoReveal]);

    // ───── 初始滚动 ─────
    useEffect(() => {
        if (state.cursor.tick === 0) {
            const team = state.teamStates[state.cursor.index];
            const element = document.querySelector<HTMLDivElement>(
                `#team-id-${team.info.id}`
            );
            if (element) {
                element.scrollIntoView({ behavior: "smooth" });
            }
        }
    }, [state]);

    // ───── 键盘事件 ─────
    useEventListener(
        "keydown",
        useCallback(
            (e: KeyboardEvent) => {
                console.log("keydown", e.key);
                if (e.key === "Enter") {
                    if (state.cursor.index < 0) return;
                    if (keyLock) return;
                    handleNextStep();
                }
                if (e.key === "p") {
                    if (autoReveal) {
                        console.log("disable autoReveal");
                        messageInfo("禁用自动运行");
                    } else {
                        console.log("enable autoReveal");
                        messageInfo("启用自动运行");
                    }
                    setAutoReveal((a) => !a);
                }
                if (e.key === "+") {
                    const s = Math.min(speedFactor + 0.5, vo.MAX_SPEED_FACTOR);
                    setSpeedFactor(s);
                    console.log("speedFactor", s);
                    messageInfo(`速度因子：${s.toFixed(1)}`);
                }
                if (e.key === "-") {
                    const s = Math.max(speedFactor - 0.5, vo.MIN_SPEED_FACTOR);
                    setSpeedFactor(s);
                    console.log("speedFactor", s);
                    messageInfo(`速度因子：${s.toFixed(1)}`);
                }
                if (e.key === "Control") {
                    let s = speedFactor + 3;
                    if (s > vo.MAX_SPEED_FACTOR) s -= vo.MAX_SPEED_FACTOR;
                    if (s < vo.MIN_SPEED_FACTOR) s = vo.MIN_SPEED_FACTOR;
                    setSpeedFactor(s);
                    console.log("speedFactor", s);
                    messageInfo(`速度因子：${s.toFixed(1)}`);
                }
            },
            [handleNextStep, keyLock, speedFactor, state.cursor, autoReveal]
        )
    );

    // ───── 鼠标点击事件 ─────
    useEventListener(
        "click",
        useCallback(() => {
            if (state.cursor.index < 0) return;
            if (keyLock) return;
            console.log("click");
            handleNextStep();
        }, [handleNextStep, keyLock, state.cursor])
    );

    // ───── 自动运行定时器 ─────
    useEffect(() => {
        if (state.cursor.tick !== 0 && autoReveal && state.cursor.index >= 0) {
            const timer = util.runInterval(500 / speedFactor, () => {
                if (keyLock) return;
                const done = handleNextStep();
                if (done) timer.stop();
            });
            return () => timer.stop();
        }
    }, [state, keyLock, handleNextStep, autoReveal, speedFactor]);

    // ───── 揭榜前闪烁效果 ─────
    useEffect(() => {
        if (highlightItem && options.shiningBeforeReveal) {
            setHighlightFlag((f) => !f);
            const timer = util.runInterval(400 / speedFactor, () => {
                setHighlightFlag((f) => {
                    console.log("flag", !f);
                    return !f;
                });
            });
            return () => timer.stop();
        }
    }, [highlightItem, options, speedFactor]);

    const handleMovingFinished = useCallback(() => {
        setFocusIndex(state.cursor.index);
    }, [state.cursor]);

    // ───── 进度统计 ─────
    const revealedCount = state.teamStates.reduce(
        (acc, t) =>
            acc +
            t.problemStates.reduce(
                (a, p) =>
                    a +
                    p.revealedSubmissions.length +
                    (p.state === vo.ProblemStateKind.Passed ||
                    p.state === vo.ProblemStateKind.Failed
                        ? p.unrevealedSubmissions.length
                        : 0),
                0
            ),
        0
    );

    // ───── 渲染 ─────
    return (
        <div className="resolver-container">
            {/* ===== 顶部标题栏 ===== */}
            <div className="resolver-header">
                <span className="resolver-title">
                    {state.info.name || "Resolver"}
                </span>
                <span className="resolver-progress">
                    {state.cursor.index >= 0
                        ? `Team ${state.teamStates.length - state.cursor.index} / ${state.teamStates.length}`
                        : "Complete"}
                </span>
                <div
                    className="lock-dot"
                    style={{
                        background: keyLock ? "#cf222e" : "#1a7f37",
                    }}
                />
            </div>

            {/* ===== 题目编号行 ===== */}
            <div className="problem-labels">
                {data.problems.map((p) => (
                    <div
                        key={p.id}
                        className="problem-label"
                        style={{ color: p.color || "#484f58" }}
                    >
                        {p.tag}
                    </div>
                ))}
            </div>

            {/* ===== 队伍卡片列表 ===== */}
            <FlipMove
                className="board-body"
                duration={vo.FLIP_MOVE_DURATION / speedFactor}
                onFinish={handleMovingFinished}
            >
                {state.teamStates.map((team, idx) => {
                    const isFocused = idx === focusIndex;
                    const medalColor =
                        options.showMedal
                            ? getMedalColor(idx, state.info.medal)
                            : undefined;

                    return (
                        <div
                            key={team.info.id}
                            id={`team-id-${team.info.id}`}
                            className={`team-card${isFocused ? " focused" : ""}`}
                        >
                            {/* 奖牌色条 */}
                            <div
                                className="medal-stripe"
                                style={{
                                    background: medalColor || "transparent",
                                }}
                            />

                            {/* 名次 */}
                            <div className="team-rank">
                                {team.info.wildcard
                                    ? `*${team.rank}`
                                    : team.rank}
                            </div>

                            {/* 队伍名称 */}
                            <div className="team-name-section">
                                <div className="team-name">
                                    {team.info.name}
                                    {team.info.gender === "female" && (
                                        <WomanOutlined className="gender-icon" />
                                    )}
                                </div>
                                {team.info.userName && (
                                    <div className="team-org">
                                        {team.info.userName}
                                    </div>
                                )}
                                {team.info.certifiedName &&
                                    team.info.certifiedName !==
                                        team.info.name && (
                                        <div className="team-certified">
                                            {team.info.certifiedName}
                                        </div>
                                    )}
                            </div>

                            {/* 得分与罚时 */}
                            <div className="team-score-section">
                                <span className="solved-count">
                                    {team.score}
                                </span>
                                <span className="penalty-time">
                                    {Math.round(team.penalty / 60000)}
                                </span>
                            </div>

                            {/* 题目泡泡 */}
                            <div className="problem-bubbles">
                                {team.problemStates.map((p) => {
                                    const isHighlighted =
                                        highlightItem &&
                                        highlightItem.teamId ===
                                            team.info.id &&
                                        highlightItem.problemId === p.info.id;

                                    const isFirstSolver =
                                        state.firstSolvers[p.info.id] ===
                                            team.info.id &&
                                        p.state ===
                                            vo.ProblemStateKind.Passed;

                                    const stateClass =
                                        getBubbleStateClass(p);
                                    const firstSolveClass = isFirstSolver
                                        ? " first-solve"
                                        : "";
                                    const highlightClass = isHighlighted
                                        ? " highlight-glow"
                                        : "";
                                    const shiningClass =
                                        isHighlighted && highlightFlag
                                            ? " shining"
                                            : "";

                                    return (
                                        <div
                                            key={p.info.id}
                                            className={
                                                `problem-bubble ${stateClass}` +
                                                `${firstSolveClass}${highlightClass}${shiningClass}`
                                            }
                                        >
                                            {getBubbleContent(p)}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </FlipMove>

            {/* 底部留白，方便滚动 */}
            <div className="board-spacer" />
        </div>
    );
};

export default Board;
