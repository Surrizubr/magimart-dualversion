import React, { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { Trash2, ShoppingCart, Archive, ArchiveRestore } from 'lucide-react';

interface SwipeableRowProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftBg?: string;
  rightBg?: string;
  className?: string;
}

export function SwipeableRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftIcon = <Trash2 className="w-5 h-5 text-destructive-foreground" />,
  rightIcon = <ShoppingCart className="w-5 h-5 text-primary-foreground" />,
  leftBg = 'bg-destructive',
  rightBg = 'bg-primary',
  className = '',
}: SwipeableRowProps) {
  const [dragX, setDragX] = useState(0);
  const threshold = 100;

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (info.offset.x > threshold && onSwipeRight) {
      onSwipeRight();
    }
    setDragX(0);
  };

  const showLeft = dragX < -30;
  const showRight = dragX > 30;

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <div className={`absolute inset-y-0 left-0 w-full flex items-center justify-end pr-4 rounded-xl ${showLeft ? leftBg : 'bg-transparent'} transition-colors`}>
        {showLeft && leftIcon}
      </div>
      <div className={`absolute inset-y-0 right-0 w-full flex items-center justify-start pl-4 rounded-xl ${showRight ? rightBg : 'bg-transparent'} transition-colors`}>
        {showRight && rightIcon}
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDrag={(_, info) => setDragX(info.offset.x)}
        onDragEnd={handleDragEnd}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
