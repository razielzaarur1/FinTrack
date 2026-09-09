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
  Percent, TrendingDown, Tag, HelpCircle
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
  Percent, TrendingDown, Tag, HelpCircle
};

export default function CategoryBadge({ category, size = 20, className = '', showLabel = false }) {
  const { mainCat, subCat } = getCategoryDetails(category);
  const iconName = subCat?.icon || mainCat?.icon || 'Tag';
  const IconComponent = ICON_MAP[iconName] || Tag;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div 
        className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 shadow-sm border border-black/5 dark:border-white/5 transition-transform hover:scale-105 ${mainCat.bg} ${mainCat.color}`}
        title={subCat?.name !== mainCat?.name ? `${mainCat.name} • ${subCat?.name}` : mainCat.name}
      >
        <IconComponent size={size} strokeWidth={2} />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-dark-text-muted light:text-light-text-muted truncate">
          {subCat?.name || mainCat.name}
        </span>
      )}
    </div>
  );
}
