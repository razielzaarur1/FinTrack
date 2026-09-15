'use client';

import React from 'react';
import {
  Wallet, Landmark, Home, Briefcase, TrendingUp, MoreHorizontal,
  Tv, Key, Users, Droplet, Flame, Zap, Shield, Hammer, Sparkles, Flower,
  ShoppingBag, Sofa, Monitor, Shirt, Watch, Wind,
  Car, Fuel, Bus, Map, ScrollText, Wrench, Route,
  Heart, Activity, Stethoscope, HeartPulse, Eye, Pill, Scissors, Dumbbell,
  Baby, GraduationCap, Tent, User, Gamepad2, Package, HandHeart, Dog,
  Ticket, Gift, Music, BookOpen, Bike, Trophy,
  Utensils, Pizza, Coffee,
  Plane, Bed,
  Mail, FileText, Printer, Lightbulb,
  Percent, TrendingDown, Tag, HelpCircle, Banknote
} from 'lucide-react';
import { getCategoryDetails } from '@/lib/categories';
import { normalizeCategorySvg } from '@/lib/svg-normalizer';

const ICON_MAP = {
  Wallet, Landmark, Home, Briefcase, TrendingUp, MoreHorizontal,
  Tv, Key, Users, Droplet, Flame, Zap, Shield, Hammer, Sparkles, Flower,
  ShoppingBag, Sofa, Monitor, Shirt, Watch, Wind,
  Car, Fuel, Bus, Map, ScrollText, Wrench, Route,
  Heart, Activity, Stethoscope, HeartPulse, Eye, Pill, Scissors, Dumbbell,
  Baby, GraduationCap, Tent, User, Gamepad2, Package, HandHeart, Dog,
  Ticket, Gift, Music, BookOpen, Bike, Trophy,
  Utensils, Pizza, Coffee,
  Plane, Bed,
  Mail, FileText, Printer, Lightbulb,
  Percent, TrendingDown, Tag, HelpCircle, Banknote
};

import * as LucideIcons from 'lucide-react';

export default function CategoryBadge({
  category,
  customSvg = null,
  size = 20,
  className = '',
  showLabel = false,
}) {
  const { mainCat, subCat } = getCategoryDetails(category);
  const activeSvg = customSvg || subCat?.customSvg || mainCat?.customSvg;
  const iconName = subCat?.icon || mainCat?.icon || 'Tag';
  const IconComponent = ICON_MAP[iconName] || LucideIcons[iconName] || Tag;

  // Determine effective color & background (supports hex colors and parent inheritance)
  const rawColor = subCat?.color || mainCat?.color;
  const isHex = rawColor && rawColor.startsWith('#');
  const catColor = isHex ? rawColor : null;
  const catBg = isHex ? `${rawColor}20` : null;

  const colorClass = !isHex ? (subCat?.color || mainCat?.color || 'text-slate-500 dark:text-slate-400') : '';
  const bgClass = !isHex ? (subCat?.bg || mainCat?.bg || 'bg-slate-500/10 dark:bg-slate-500/20') : '';

  const containerSizeClass =
    size <= 12
      ? 'w-5 h-5 rounded-md text-[10px]'
      : size <= 15
      ? 'w-6 h-6 rounded-md text-xs'
      : size <= 18
      ? 'w-7 h-7 rounded-lg text-xs'
      : 'w-10 h-10 rounded-xl';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${containerSizeClass} inline-flex items-center justify-center shrink-0 shadow-2xs border border-black/5 dark:border-white/5 transition-transform hover:scale-105 overflow-hidden ${colorClass} ${bgClass}`}
        style={isHex ? { color: catColor, backgroundColor: catBg } : undefined}
        title={subCat?.name && subCat.name !== mainCat.name ? `${mainCat.name} • ${subCat.name}` : mainCat.name}
      >
        {activeSvg ? (
          <div
            className="w-full h-full flex items-center justify-center p-1 overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain"
            dangerouslySetInnerHTML={{ __html: normalizeCategorySvg(activeSvg) }}
          />
        ) : (
          <IconComponent size={size} strokeWidth={2} />
        )}
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-dark-text-muted light:text-light-text-muted truncate">
          {subCat?.name || mainCat.name}
        </span>
      )}
    </div>
  );
}
