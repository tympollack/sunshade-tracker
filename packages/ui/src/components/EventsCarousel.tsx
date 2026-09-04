'use client';

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, DimensionValue, Animated, Easing, Image } from 'react-native';

export interface HubEvent {
  id: string;
  title: string;
  description: string;
  image_url: string;
  call_to_action_url?: string;
  start_time: string;
  end_time: string;
}

interface EventsCarouselProps {
  events: HubEvent[];
  width?: DimensionValue;
}

export function EventsCarousel({ events, width = '100%' }: EventsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(350);
  const translateX = useRef(new Animated.Value(0)).current; 

  useEffect(() => {
    if (!events || events.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % events.length;
        Animated.timing(translateX, {
          toValue: -next * carouselWidth,
          duration: 600,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: false,
        }).start();
        return next;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [events, carouselWidth]);

  if (!events || events.length === 0) {
    return (
      <View style={[styles.container, { width }]}>
        <Text style={styles.emptyText}>No active events</Text>
      </View>
    );
  }

  return (
    <View 
      style={[styles.container, { width, overflow: 'hidden' }]}
      onLayout={(e) => {
        if (e.nativeEvent.layout.width > 0) {
          setCarouselWidth(e.nativeEvent.layout.width);
        }
      }}
    >
      <Animated.View 
        style={[
          styles.row,
          { width: carouselWidth * events.length },
          { transform: [{ translateX }] }
        ]}
      >
        {events.map((ev, i) => (
          <View key={ev.id} style={[styles.slide, { width: carouselWidth }]}>
            <View style={styles.card}>
              {ev.image_url ? (
                <Image source={{ uri: ev.image_url }} style={styles.cardBackground} resizeMode="cover" />
              ) : null}
              {ev.image_url && <View style={styles.cardOverlay} />}
              <View style={styles.cardContent}>
                <Text style={styles.title}>{ev.title}</Text>
                <Text style={styles.desc} numberOfLines={2}>{ev.description}</Text>
                {ev.call_to_action_url && (
                  <Pressable style={styles.button} onPress={() => {
                    if (Platform.OS === 'web') {
                      window.open(ev.call_to_action_url, '_blank');
                    }
                  }}>
                    <Text style={styles.buttonText}>Learn More</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ))}
      </Animated.View>
      
      {/* Pagination dots */}
      <View style={styles.dots}>
        {events.map((_, i) => (
          <View 
            key={i} 
            style={[styles.dot, currentIndex === i ? styles.dotActive : null]} 
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 240,
    backgroundColor: '#161616', // zinc-900/40 equivalent ish
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyText: {
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 100,
  },
  row: {
    flexDirection: 'row',
    height: '100%',
  },
  slide: {
    height: '100%',
    padding: 16,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(234, 88, 12, 0.1)', // Orange tint
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234, 88, 12, 0.2)',
    overflow: 'hidden',
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: '#d4d4d8',
    marginBottom: 16,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#ea580c',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#ea580c',
    width: 12,
  }
});
