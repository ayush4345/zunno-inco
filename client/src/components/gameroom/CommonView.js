import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const CommonView = ({
  playedCardsPile,
  onCardDrawnHandler,
  isDrawDisabled,
  onUnoClicked,
  isUnoDisabled,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);

  const handleDrawCard = () => {
    if (isDrawing) return; // Prevent multiple clicks

    setIsDrawing(true);
    onCardDrawnHandler();

    // Re-enable the button after a short delay
    setTimeout(() => {
      setIsDrawing(false);
    }, 500);
  };
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100vh" }}>
        <motion.button
          className="draw-deck"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pointerEvents: (isDrawDisabled || isDrawing) ? "none" : "auto",
            filter: (isDrawDisabled || isDrawing) ? "grayscale(1)" : "none",
            width: "5rem",
            marginTop: "10rem",
            position: "absolute",
            left: "50%",
            zIndex: "10"
          }}
          animate={isDrawDisabled || isDrawing
            ? { x: "-50%", y: 56, scale: 1 }
            : { x: "-50%", y: [56, 50, 56], scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92, rotate: -4 }}
          transition={isDrawDisabled || isDrawing
            ? { duration: 0.2 }
            : { y: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } }}
          role="button"
          disabled={isDrawDisabled || isDrawing}
          onClick={handleDrawCard}
        >
          <img src="/images/draw.png" alt="draw" />
        </motion.button>
      {playedCardsPile && playedCardsPile.length > 0 && (
        <div style={{
          position: "absolute",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "fit-content",
          margin: "0 auto",
          left: "50%",
          transform: "translateX(-50%)"
        }}>
          <AnimatePresence mode="popLayout">
            <motion.img
              key={playedCardsPile[playedCardsPile.length - 1]}
              initial={{ opacity: 0, y: -70, rotate: -14, scale: 0.65 }}
              animate={{ opacity: 1, y: 0, rotate: 2, scale: 1 }}
              exit={{ opacity: 0, y: 20, rotate: 12, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 340, damping: 22 }}
              style={{
                pointerEvents: "none",
                width: "5.5rem",
                height: "8rem",
                borderRadius: "0.5rem",
                boxShadow: "0 0 15px rgba(14, 165, 233, 0.5)"
              }}
              alt={`cards-front ${playedCardsPile[playedCardsPile.length - 1]}`}
              src={`/assets/cards-front/${playedCardsPile[playedCardsPile.length - 1]}.webp`}
            />
          </AnimatePresence>
        </div>
      )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            position: "absolute",
            bottom: "-56px",
            left: "50%",
            transform: "translateX(-50%)"
          }}
        >
          <motion.button
            onClick={onUnoClicked}
            disabled={isUnoDisabled}
            style={{
              color: "white",
              fontWeight: "bold",
              fontSize: "1rem",
              width: "10rem",
              filter: isUnoDisabled ? "grayscale(1)" : "none",
              marginTop: "10rem"
            }}
            whileHover={isUnoDisabled ? undefined : { scale: 1.08, rotate: -2 }}
            whileTap={isUnoDisabled ? undefined : { scale: 0.92 }}
          >
            <img src="/images/zunno-button.png" alt="uno" />
          </motion.button>
        </div>
      </div>

      {/* Current card display with glow effect */}
    </div>
  );
};

export default CommonView;
