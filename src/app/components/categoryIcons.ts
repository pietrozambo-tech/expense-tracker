import { 
  ShoppingCart, 
  UtensilsCrossed, 
  Car, 
  Plane, 
  Coffee, 
  Home, 
  Heart, 
  Dumbbell, 
  Film, 
  Zap, 
  ShoppingBag, 
  MoreHorizontal, 
  Gift, 
  CreditCard, 
  FileText, 
  Sparkles,
  Smartphone,
  Laptop,
  Book,
  Music,
  Palette,
  Briefcase,
  GraduationCap,
  Baby,
  PawPrint,
  Leaf,
  Utensils,
  Pizza,
  Beer,
  IceCream,
  Candy,
  TrendingUp,
  Building2,
  Wrench,
  Plug,
  Fuel,
  // Leisure and travel, which the set could not express: betting and a night
  // out both landed on Film or Sparkles, and a holiday on Plane whether it
  // was a flight or a fortnight by the sea.
  //
  // Two substitutions worth knowing about, because lucide has no glyph for
  // either thing literally. A slot machine is a Cherry - the symbol on the
  // reels, and the one people read as "slots" without a caption. An island is
  // Waves: a palm tree IS the island glyph everywhere, and Palmtree is right
  // here in the same batch, so the second one has to say sea rather than draw
  // the same tree twice.
  Dices,
  Spade,
  Cherry,
  Waves,
  Palmtree,
  // Mine: the set has Film for the cinema but nothing for a ticketed
  // anything - a match, a gig, a museum, a ferry. It also sits naturally
  // beside the five above, which are mostly nights out and trips.
  Ticket
} from 'lucide-react';

export const availableIcons = {
  Coffee,
  UtensilsCrossed,
  Gift,
  ShoppingCart,
  Heart,
  Home,
  Sparkles,
  ShoppingBag,
  Dumbbell,
  CreditCard,
  FileText,
  Car,
  Plane,
  MoreHorizontal,
  Smartphone,
  Laptop,
  Book,
  Music,
  Film,
  Palette,
  Briefcase,
  GraduationCap,
  Baby,
  PawPrint,
  Leaf,
  Utensils,
  Pizza,
  Beer,
  IceCream,
  Candy,
  Zap,
  TrendingUp,
  Building2,
  Wrench,
  Plug,
  Fuel,
  Dices,
  Spade,
  Cherry,
  Waves,
  Palmtree,
  Ticket
};

export type IconName = keyof typeof availableIcons;

export function getCategoryIcon(iconName: string) {
  return availableIcons[iconName as IconName] || MoreHorizontal;
}

export const iconsList: IconName[] = Object.keys(availableIcons) as IconName[];