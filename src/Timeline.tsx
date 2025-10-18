// A timeline widget, showcasing major events that happened in the area. Best to be streaming, with info gradually filling it up
import React, { useMemo } from "react";
import clsx from "clsx";
import { motion, useReducedMotion } from "framer-motion";
// 你已上传的增强版样式文件
import "./Timeline.css";

/**
 * Timeline 组件（质感设计版）
 * - 不更改外部接口：宽松读取 props 内的 events/items/data
 * - 自动识别常见字段: title/name, description/content/summary, date/time, tags/labels, href/link/url, onClick 等
 * - 若传入 icon(ReactNode) 或 type（如 "milestone"|"success"|"warning"|"info"），会用于渲染彩色发光图标
 * - 全屏占位，支持滚动；中轴霓虹渐变；卡片玻璃毛玻璃 + 光晕；粒子 & 光斑背景
 */

type AnyEvent = Record<string, any>;
type AnyProps = Record<string, any>;

const ICON_COLORS: Record<string, string> = {
    success: "linear-gradient(135deg,#22c55e,#10b981)",
    warning: "linear-gradient(135deg,#f59e0b,#ef4444)",
    info: "linear-gradient(135deg,#06b6d4,#6366f1)",
    milestone: "linear-gradient(135deg,#8b5cf6,#06b6d4)",
    default: "linear-gradient(135deg,#6366f1,#8b5cf6)",
};

function getArrayFromProps(props: AnyProps): AnyEvent[] {
    return (props.events ?? props.items ?? props.data ?? []) as AnyEvent[];
}

function pick<T = any>(obj: AnyEvent, keys: string[], fallback?: T): T {
    for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null) return v as T;
    }
    return fallback as T;
}

function colorForType(type?: string) {
    if (!type) return ICON_COLORS.default;
    return ICON_COLORS[type] ?? ICON_COLORS.default;
}

const ParticleBackground: React.FC = () => {
    const prefersReducedMotion = useReducedMotion();
    const particles = useMemo(() => {
        // 稍微少一点粒子，兼顾性能
        const N = 36;
        return Array.from({ length: N }).map((_, i) => ({
            id: i,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            delay: Math.random() * 6,
            scale: 0.75 + Math.random() * 0.75,
        }));
    }, []);

    return (
        <div className="particle-background">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="particle"
                    style={{ top: p.top, left: p.left }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={
                        prefersReducedMotion
                            ? { opacity: 0.5, scale: p.scale }
                            : {
                                opacity: [0.2, 0.8, 0.4, 0.7],
                                scale: [0.6, p.scale, p.scale * 1.15, p.scale],
                                y: [0, -10, 0, 8],
                                x: [0, 4, -3, 0],
                            }
                    }
                    transition={{
                        duration: 6 + p.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
};

const BackgroundOrbs: React.FC = () => {
    return (
        <div className="timeline-background-elements">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
        </div>
    );
};

const Timeline: React.FC<AnyProps> = (props) => {
    const items = getArrayFromProps(props);
    const hasEvents = items && items.length > 0;

    return (
        <div className="timeline-container-enhanced">
            <BackgroundOrbs />
            <ParticleBackground />

            <div className={clsx("timeline-enhanced", hasEvents && "has-events")}>
                {!hasEvents && (
                    <div className="timeline-empty-enhanced">
                        <div className="empty-icon-enhanced">✨</div>
                        <div className="empty-text-enhanced">暂无事件</div>
                        <div className="empty-subtext-enhanced">
                            添加一些里程碑或活动吧，让时间线发光起来～
                        </div>
                    </div>
                )}

                {hasEvents &&
                    items.map((raw: AnyEvent, idx: number) => {
                        const side = idx % 2 === 0 ? "left" : "right";

                        const title =
                            pick<string>(raw, ["title", "name", "heading"], "未命名事件") ||
                            "未命名事件";
                        const description = pick<string>(
                            raw,
                            ["description", "content", "summary", "desc"],
                            ""
                        );
                        const date =
                            pick<string>(raw, ["date", "time", "timestamp", "createdAt"], "") ||
                            "";
                        const tags = (pick<string[]>(raw, ["tags", "labels"], []) || []).filter(
                            Boolean
                        );

                        const href =
                            pick<string>(raw, ["href", "link", "url", "to"], undefined) ??
                            undefined;
                        const onClick = pick<(() => void) | undefined>(raw, ["onClick"], undefined);

                        const type = pick<string>(raw, ["type", "status", "level"], undefined);
                        const gradient = colorForType(type);

                        const iconNode = raw?.icon ?? (
                            <span role="img" aria-label="dot">
                ●
              </span>
                        );

                        const canClick = typeof onClick === "function" || typeof href === "string";
                        const ctaLabel =
                            pick<string>(raw, ["ctaLabel", "actionLabel", "buttonLabel"], undefined) ??
                            (href || onClick ? "查看详情" : undefined);

                        return (
                            <motion.div
                                key={raw?.id ?? idx}
                                className={clsx("timeline-event-enhanced", side)}
                                initial={{ opacity: 0, y: 40, rotateX: 8 }}
                                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            >
                                {/* 连接线（卡片到中轴） */}
                                <div className="timeline-connector">
                                    <div className="connector-line" />
                                    <div className="connector-glow" />
                                </div>

                                {/* 发光圆形图标 */}
                                <div className="timeline-icon-container">
                                    <div className="animated-icon-wrapper">
                                        <motion.div
                                            className="icon-glow"
                                            style={{ background: gradient, filter: "blur(20px)", opacity: 0.35 }}
                                            initial={{ scale: 0.6, opacity: 0 }}
                                            whileInView={{ scale: 1, opacity: 0.4 }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 0.6 }}
                                        />
                                        <motion.div
                                            className="timeline-icon-enhanced"
                                            style={{
                                                background: "rgba(30,30,46,.6)",
                                                boxShadow:
                                                    "inset 0 1px 0 rgba(255,255,255,.25), 0 0 20px rgba(99,102,241,.35)",
                                            }}
                                            whileHover={{ scale: 1.06, rotate: 3 }}
                                            transition={{ type: "spring", stiffness: 260, damping: 18 }}
                                        >
                                            {iconNode}
                                        </motion.div>
                                    </div>
                                </div>

                                {/* 卡片 */}
                                <motion.div
                                    className="timeline-content-enhanced"
                                    whileHover={{ y: -2 }}
                                    style={{
                                        borderImage: `linear-gradient(90deg, rgba(255,255,255,.2), rgba(255,255,255,0)) 1`,
                                    }}
                                >
                                    <div
                                        className="event-glow"
                                        style={{ background: gradient }}
                                        aria-hidden
                                    />
                                    <div className="timeline-content-inner">
                                        {date && <div className="timeline-date-enhanced">{date}</div>}
                                        <div className="timeline-title-enhanced">{title}</div>
                                        {description && (
                                            <div className="timeline-description-enhanced">{description}</div>
                                        )}

                                        {tags?.length > 0 && (
                                            <div className="timeline-tags">
                                                {tags.map((t: string, i: number) => (
                                                    <span key={i} className="timeline-tag">
                            {t}
                          </span>
                                                ))}
                                            </div>
                                        )}

                                        {canClick && ctaLabel && (
                                            <div>
                                                {typeof href === "string" ? (
                                                    <a
                                                        className="timeline-button-enhanced"
                                                        href={href}
                                                        target={raw?.target ?? "_blank"}
                                                        rel="noreferrer"
                                                    >
                                                        <span className="button-glow" />
                                                        {ctaLabel}
                                                    </a>
                                                ) : (
                                                    <button
                                                        className="timeline-button-enhanced"
                                                        onClick={onClick}
                                                        type="button"
                                                    >
                                                        <span className="button-glow" />
                                                        {ctaLabel}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                    })}
            </div>
        </div>
    );
};

export default Timeline;
