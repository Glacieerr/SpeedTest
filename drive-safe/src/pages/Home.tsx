import React, { useState, useRef, useEffect } from 'react';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonButton } from '@ionic/react';
import { Geolocation } from '@capacitor/geolocation';
import { Plugins } from '@capacitor/core';
import './Home.css';

const { BackgroundTask } = Plugins;

// Haversine formula for distance
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Radius in meters
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Kalman filter
class KalmanFilter {
  constructor(private R: number, private Q: number) {
    this.A = 1;
    this.C = 1;
    this.cov = NaN;
    this.x = NaN;
  }
  private A: number;
  private C: number;
  private cov: number;
  private x: number;

  filter(z: number): number {
    if (isNaN(this.x)) {
      this.x = z;
      this.cov = 1;
    } else {
      this.cov += this.R;
      const K = this.cov / (this.cov + this.Q);
      this.x += K * (z - this.x);
      this.cov *= (1 - K);
    }
    return this.x;
  }
}

const kalmanLat = new KalmanFilter(0.00001, 0.001);
const kalmanLon = new KalmanFilter(0.00001, 0.001);
const kalmanSpeed = new KalmanFilter(0.1, 0.1);

const Home: React.FC = () => {
  const [speed, setSpeed] = useState<number>(0);
  const [displayedSpeed, setDisplayedSpeed] = useState<number>(0);
  const [tracking, setTracking] = useState<boolean>(false);
  const lastPosition = useRef<{ lat: number; lon: number; timestamp: number } | null>(null);
  const watchId = useRef<string | null>(null);

  const smoothSpeedTransition = (targetSpeed: number) => {
    if (displayedSpeed !== targetSpeed) {
      const step = targetSpeed > displayedSpeed ? 0.5 : -0.5;
      const interval = setInterval(() => {
        setDisplayedSpeed((prev) => {
          const newSpeed = prev + step;
          if ((step > 0 && newSpeed >= targetSpeed) || (step < 0 && newSpeed <= targetSpeed)) {
            clearInterval(interval);
            return targetSpeed;
          }
          return newSpeed;
        });
      }, 25); // Faster updates for real-time response
    }
  };

  const calculateSpeed = (lat1: number, lon1: number, time1: number, lat2: number, lon2: number, time2: number) => {
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    const timeDiff = (time2 - time1) / 1000;
    return (distance / timeDiff) * 3.6; // Speed in km/h
  };

  const startTracking = async () => {
    setTracking(true);

    watchId.current = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 0 },
      (position, err) => {
        if (err || !position?.coords) {
          console.error('Error or invalid position', err);
          return;
        }

        const { latitude, longitude, accuracy, speed: deviceSpeed } = position.coords;
        const timestamp = Date.now();

        if (accuracy > 10) {
          console.log('Low accuracy reading discarded');
          return;
        }

        const smoothedLat = kalmanLat.filter(latitude);
        const smoothedLon = kalmanLon.filter(longitude);

        if (deviceSpeed) {
          const smoothedSpeed = kalmanSpeed.filter(deviceSpeed * 3.6);
          setSpeed(smoothedSpeed);
          smoothSpeedTransition(smoothedSpeed);
        } else if (lastPosition.current) {
          const { lat, lon, timestamp: prevTimestamp } = lastPosition.current;
          const calculatedSpeed = calculateSpeed(lat, lon, prevTimestamp, smoothedLat, smoothedLon, timestamp);
          const smoothedSpeed = calculatedSpeed > 5 ? kalmanSpeed.filter(calculatedSpeed) : 0;
          setSpeed(smoothedSpeed);
          smoothSpeedTransition(smoothedSpeed);
        }

        lastPosition.current = { lat: smoothedLat, lon: smoothedLon, timestamp };
      }
    );
  };

  const stopTracking = () => {
    setTracking(false);
    if (watchId.current) {
      Geolocation.clearWatch({ id: watchId.current });
      watchId.current = null;
    }
    lastPosition.current = null;
  };

  useEffect(() => {
    return () => stopTracking(); // Cleanup
  }, []);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Track</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {!tracking ? (
          <IonButton onClick={startTracking}>Start Tracking</IonButton>
        ) : (
          <>
            <h1>Speed: {displayedSpeed.toFixed(1)} km/h</h1>
            <IonButton onClick={stopTracking}>Stop Tracking</IonButton>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Home;
