import React from "react";
import { AnimatePresence, motion } from "framer-motion";

const MainPlayerView = ({
  turn,
  playerDeck,
  onCardPlayedHandler,
  mainPlayer,
}) => {
  return (
    <>
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "0.5rem",
        minHeight: "7rem",
        position: "relative"
      }}>
        <AnimatePresence>
          {playerDeck.map((item, i) => {
            const totalCards = playerDeck.length;
            const fanAngle = Math.min(40, totalCards * 5);
            const cardAngle = totalCards === 1
              ? 0
              : (fanAngle / (totalCards - 1)) * (i - (totalCards - 1) / 2);
            const isPlayable = turn === mainPlayer;

            return (
              <motion.button
                key={item + i}
                type="button"
                layout
                disabled={!isPlayable}
                aria-label={`Play ${item}`}
                initial={{ opacity: 0, y: 72, rotate: cardAngle - 8, scale: 0.75 }}
                animate={{ opacity: 1, y: 0, rotate: cardAngle, scale: isPlayable ? 1.04 : 0.88 }}
                exit={{ opacity: 0, y: -80, rotate: cardAngle + 16, scale: 0.7 }}
                whileHover={isPlayable ? { y: -20, scale: 1.12, zIndex: 50 } : undefined}
                whileTap={isPlayable ? { scale: 0.96 } : undefined}
                transition={{ type: "spring", stiffness: 360, damping: 26, delay: i * 0.035 }}
                onClick={() => onCardPlayedHandler(item)}
                style={{
                  position: "relative",
                  margin: "0 -15px",
                  transformOrigin: "bottom center",
                  zIndex: i,
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  cursor: isPlayable ? "pointer" : "default",
                  filter: isPlayable ? "none" : "brightness(0.75)",
                }}
              >
                <img
                  style={{
                    pointerEvents: "none",
                    width: "3.5rem",
                    height: "5.5rem",
                    borderRadius: "0.5rem",
                    border: turn === mainPlayer ? "2px solid rgba(14, 165, 233, 0.3)" : "none"
                  }}
                  alt={`cards-front ${item}`}
                  className={turn === mainPlayer ? "glow" : ""}
                  src={`/assets/cards-front/${item}.webp`}
                />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Hide the skip button as it's now handled in the parent */}
    </>
  );
};

export default MainPlayerView;
