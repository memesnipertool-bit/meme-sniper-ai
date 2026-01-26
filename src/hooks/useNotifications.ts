import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'trade';
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

const NOTIFICATIONS_STORAGE_KEY_PREFIX = 'meme_sniper_notifications_';
const MAX_NOTIFICATIONS = 50;

// Get user-specific storage key
const getStorageKey = (userId: string | null): string => {
  return userId ? `${NOTIFICATIONS_STORAGE_KEY_PREFIX}${userId}` : `${NOTIFICATIONS_STORAGE_KEY_PREFIX}anonymous`;
};

// Load notifications from localStorage for specific user
const loadFromStorage = (userId: string | null): Notification[] => {
  try {
    const key = getStorageKey(userId);
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load notifications from storage:', error);
  }
  return [];
};

// Save notifications to localStorage for specific user
const saveToStorage = (notifications: Notification[], userId: string | null) => {
  try {
    // Keep only the most recent notifications
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    const key = getStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save notifications to storage:', error);
  }
};

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  
  // Initialize with user-specific notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // CRITICAL: Load user-specific notifications when user changes
  useEffect(() => {
    setNotifications(loadFromStorage(userId));
  }, [userId]);

  // Calculate unread count
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.read).length);
  }, [notifications]);

  // Persist to user-specific localStorage whenever notifications change
  useEffect(() => {
    saveToStorage(notifications, userId);
  }, [notifications, userId]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Add a new notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'created_at' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS));
    return newNotification;
  }, []);

  // Delete a notification
  const deleteNotification = useCallback((notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Refresh (reload from storage)
  const refresh = useCallback(() => {
    setLoading(true);
    setNotifications(loadFromStorage(userId));
    setLoading(false);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    addNotification,
    deleteNotification,
    clearAll,
    refresh,
  };
}
