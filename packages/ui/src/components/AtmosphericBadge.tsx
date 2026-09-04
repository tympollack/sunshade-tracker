import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle, type StyleProp } from 'react-native';
import { cn } from '../utils/cn';

export interface AtmosphericBadgeProps {
  label: string;
  variant?: 'core' | 'cozy' | 'telemetry' | 'success' | 'warning' | 'error' | 'neutral';
  statusDot?: boolean;
  pulse?: boolean;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantConfig = {
  core: {
    container: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    dot: 'bg-orange-500',
    text: 'text-orange-300',
    styleBg: 'rgba(204, 85, 0, 0.15)',
    styleBorder: 'rgba(204, 85, 0, 0.40)',
    styleText: '#fdba74',
    styleDot: '#CC5500',
  },
  cozy: {
    container: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    styleBg: 'rgba(245, 158, 11, 0.15)',
    styleBorder: 'rgba(245, 158, 11, 0.40)',
    styleText: '#fcd34d',
    styleDot: '#F59E0B',
  },
  telemetry: {
    container: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 font-mono',
    dot: 'bg-cyan-400',
    text: 'text-cyan-300 font-mono',
    styleBg: 'rgba(6, 182, 212, 0.15)',
    styleBorder: 'rgba(6, 182, 212, 0.40)',
    styleText: '#67e8f9',
    styleDot: '#06B6D4',
  },
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    styleBg: 'rgba(16, 185, 129, 0.15)',
    styleBorder: 'rgba(16, 185, 129, 0.40)',
    styleText: '#6ee7b7',
    styleDot: '#10B981',
  },
  warning: {
    container: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    dot: 'bg-yellow-400',
    text: 'text-yellow-300',
    styleBg: 'rgba(234, 179, 8, 0.15)',
    styleBorder: 'rgba(234, 179, 8, 0.40)',
    styleText: '#fde047',
    styleDot: '#EAB308',
  },
  error: {
    container: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    styleBg: 'rgba(244, 63, 94, 0.15)',
    styleBorder: 'rgba(244, 63, 94, 0.40)',
    styleText: '#fda4af',
    styleDot: '#F43F5E',
  },
  neutral: {
    container: 'bg-stone-800/60 border-stone-700/60 text-stone-300',
    dot: 'bg-stone-400',
    text: 'text-stone-300',
    styleBg: 'rgba(41, 37, 36, 0.60)',
    styleBorder: 'rgba(68, 64, 60, 0.60)',
    styleText: '#d6d3d1',
    styleDot: '#a8a29e',
  },
};

const sizeConfig = {
  sm: {
    container: 'px-2 py-0.5 text-xs gap-1.5 rounded-full',
    dot: 'w-1.5 h-1.5',
    text: 'text-[11px]',
    nativePaddingH: 8,
    nativePaddingV: 2,
    fontSize: 11,
    dotSize: 6,
  },
  md: {
    container: 'px-3 py-1 text-sm gap-2 rounded-full',
    dot: 'w-2 h-2',
    text: 'text-xs font-medium',
    nativePaddingH: 12,
    nativePaddingV: 4,
    fontSize: 12,
    dotSize: 8,
  },
};

/**
 * AtmosphericBadge - Cross-platform environment & status indicator badge.
 */
export function AtmosphericBadge({
  label,
  variant = 'core',
  statusDot = false,
  pulse = false,
  size = 'md',
  icon,
  className,
  style,
  textStyle,
}: AtmosphericBadgeProps) {
  const v = variantConfig[variant] || variantConfig.core;
  const s = sizeConfig[size] || sizeConfig.md;

  return (
    <View
      // @ts-ignore className support
      className={cn(
        'inline-flex flex-row items-center border backdrop-blur-sm',
        v.container,
        s.container,
        className
      )}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: v.styleBg,
          borderColor: v.styleBorder,
          borderWidth: 1,
          borderRadius: 9999,
          paddingHorizontal: s.nativePaddingH,
          paddingVertical: s.nativePaddingV,
          alignSelf: 'flex-start',
        },
        style as ViewStyle,
      ]}
    >
      {statusDot && (
        <View
          // @ts-ignore className support
          className={cn('rounded-full', v.dot, s.dot, pulse && 'animate-pulse')}
          style={{
            width: s.dotSize,
            height: s.dotSize,
            borderRadius: s.dotSize / 2,
            backgroundColor: v.styleDot,
            marginRight: 6,
          }}
        />
      )}
      {icon && <View style={{ marginRight: 4 }}>{icon}</View>}
      <Text
        // @ts-ignore className support
        className={cn(v.text, s.text)}
        style={[
          {
            color: v.styleText,
            fontSize: s.fontSize,
            fontWeight: '600',
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default AtmosphericBadge;
