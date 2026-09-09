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
  const IconComponent = ICON_MAP[iconName] || Tag;

  const containerSizeClass =
    size <= 12
      ? 'w-5 h-5 rounded-md text-[10px]'
      : size <= 15
      ? 'w-6 h-6 rounded-md text-xs'
      : size <= 18
      ? 'w-7 h-7 rounded-lg text-xs'
      : 'w-10 h-10 rounded-xl';

  const svgSizeClass =
    size <= 12
      ? '[&>svg]:w-3 [&>svg]:h-3'
      : size <= 15
      ? '[&>svg]:w-3.5 [&>svg]:h-3.5'
      : size <= 18
      ? '[&>svg]:w-4 [&>svg]:h-4'
      : '[&>svg]:w-5 [&>svg]:h-5';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${containerSizeClass} inline-flex items-center justify-center shrink-0 shadow-2xs border border-black/5 dark:border-white/5 transition-transform hover:scale-105 ${mainCat.bg} ${mainCat.color}`}
        title={subCat?.name && subCat.name !== mainCat.name ? `${mainCat.name} • ${subCat.name}` : mainCat.name}
      >
        {activeSvg ? (
          <div
            className={`flex items-center justify-center shrink-0 ${svgSizeClass} [&>svg]:stroke-current`}
            dangerouslySetInnerHTML={{ __html: activeSvg }}
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
