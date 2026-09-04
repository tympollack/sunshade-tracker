import React from 'react';
import { View, Text, Pressable, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { cn } from '../utils/cn';

export interface TokenBalanceBadgeProps {
  balance: number | string;
  symbol?: string;
  usdValue?: number | string;
  label?: string;
  variant?: 'default' | 'cozy' | 'glass' | 'mono';
  isLive?: boolean;
  icon?: React.ReactNode;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  balanceStyle?: StyleProp<TextStyle>;
}

const variantStyles = {
  default: {
    container: 'bg-stone-900/90 border-stone-800 text-white',
    symbol: 'text-orange-500 font-bold',
    styleBg: 'rgba(28, 25, 23, 0.90)',
    styleBorder: 'rgba(68, 64, 60, 0.60)',
    symbolColor: '#CC5500',
  },
  cozy: {
    container: 'bg-amber-950/40 border-amber-500/30 text-amber-100',
    symbol: 'text-amber-400 font-bold',
    styleBg: 'rgba(69, 26, 3, 0.40)',
    styleBorder: 'rgba(245, 158, 11, 0.30)',
    symbolColor: '#F59E0B',
  },
  glass: {
    container: 'backdrop-blur-md bg-stone-950/85 border-white/10 text-white shadow-lg',
    symbol: 'text-orange-400 font-bold',
    styleBg: 'rgba(12, 10, 9, 0.85)',
    styleBorder: 'rgba(255, 255, 255, 0.10)',
    symbolColor: '#ea580c',
  },
  mono: {
    container: 'bg-black/80 border-cyan-500/30 text-cyan-200',
    symbol: 'text-cyan-400 font-bold',
    styleBg: 'rgba(0, 0, 0, 0.80)',
    styleBorder: 'rgba(6, 182, 212, 0.30)',
    symbolColor: '#06B6D4',
  },
};

/**
 * TokenBalanceBadge - Displays token and system ledger balances with monospace telemetry styling.
 */
export function TokenBalanceBadge({
  balance,
  symbol = 'SUN',
  usdValue,
  label,
  variant = 'default',
  isLive = false,
  icon,
  onPress,
  className,
  style,
  balanceStyle,
}: TokenBalanceBadgeProps) {
  const v = variantStyles[variant] || variantStyles.default;

  const content = (
    <View
      // @ts-ignore className support
      className={cn(
        'inline-flex flex-row items-center gap-2 px-3 py-1.5 rounded-xl border',
        v.container,
        className
      )}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: v.styleBg,
          borderColor: v.styleBorder,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 6,
          alignSelf: 'flex-start',
        },
        style as ViewStyle,
      ]}
    >
      {isLive && (
        <View
          // @ts-ignore className support
          className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1"
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#10B981',
            marginRight: 4,
          }}
        />
      )}
      
      {icon && <View style={{ marginRight: 2 }}>{icon}</View>}

      <View style={{ flexDirection: 'column' }}>
        {label && (
          <Text
            // @ts-ignore className support
            className="font-sans text-[10px] uppercase tracking-wider text-zinc-400"
            style={{ fontSize: 10, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1 }}
          >
            {label}
          </Text>
        )}
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            // @ts-ignore className support
            className="font-mono text-sm sm:text-base font-bold text-white tracking-wide"
            style={[
              {
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: '700',
                fontFamily: 'monospace',
                letterSpacing: 0.5,
              },
              balanceStyle,
            ]}
          >
            {typeof balance === 'number' ? balance.toLocaleString() : balance}
          </Text>
          
          <Text
            // @ts-ignore className support
            className={cn('font-sans text-xs font-semibold', v.symbol)}
            style={{
              color: v.symbolColor,
              fontSize: 12,
              fontWeight: '700',
            }}
          >
            {symbol}
          </Text>
        </View>
      </View>

      {usdValue !== undefined && (
        <Text
          // @ts-ignore className support
          className="font-mono text-xs text-zinc-400 ml-1 border-l border-zinc-700 pl-2"
          style={{
            fontSize: 11,
            color: '#71717a',
            fontFamily: 'monospace',
            marginLeft: 6,
            paddingLeft: 6,
            borderLeftWidth: 1,
            borderLeftColor: '#3f3f46',
          }}
        >
          {typeof usdValue === 'number' ? `$${usdValue.toFixed(2)}` : usdValue}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

export default TokenBalanceBadge;
