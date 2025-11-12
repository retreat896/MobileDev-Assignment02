import { BASE_URL } from './config';
import { useEffect, useState, useCallback } from 'react';
import { View, FlatList, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { TextInput, Text } from 'react-native-paper';
import { Link, useFocusEffect } from 'expo-router';

export default function Add() {
    const [name, setName] = useState('');
    const [price, setPrice] = useState(0);
    const [desc, setDesc] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [robots, setRobots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchRobots = async () => {
        try {
            setError('');
            const res = await fetch(`${BASE_URL}/robots`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRobots(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchRobots();
        }, [])
    );

    if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
    if (error) return <Text style={{ color: 'red', padding: 20 }}>{error}</Text>;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Robots</Text>
                <Link href="/add" style={styles.addBtn}>
                    + Add
                </Link>
            </View>
            <Text>There are {robots.length} robots</Text>
            <TextInput label="email" placeholder="Name" onChangeText={setName} value={name} />
            <TextInput label="email" placeholder="Price" onChangeText={setPrice} value={price} />
            <TextInput label="email" placeholder="Description" onChangeText={setDesc} value={desc} />
            <TextInput label="url" placeholder="Image URL" onChangeText={setImageUrl} value={imageUrl} />
            <Button label="" onPress></Button>
        </View>
    );
}
