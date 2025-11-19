import { BASE_URL } from './config';
import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Image, FlatList, Platform, RefreshControl, Pressable, ToastAndroid } from 'react-native';
import { Text, ActivityIndicator, Portal, Dialog, FAB, TextInput, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';

// Requirements
// 1. Navigation: Provide a home or menu screen with buttons: a) All, b) One, c) Add, d) Modify, e) Delete.
// 2. Selection Strategy: For One/Modify/Delete, show a searchable/selectable list of robots first; tap to select the target item.
// 3. Validation: Prevent empty fields; require valid price (number) and imageUrl (URL).
// 4. Loading & Errors: Show loading indicators; display backend errors (status + detail).

export default function App() {
    const [robots, setNewRobots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [showAddRobot, setShowAddRobot] = useState(false);
    const [newRobot, setNewRobot] = useState({ name: '', description: '', price: '', imageUrl: '' });
    const router = useRouter();

    const fetchRobots = async () => {
        try {
            setErr('');
            const res = await fetch(`${BASE_URL}/robots`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setNewRobots(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(String(e));
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message) => {
        ToastAndroid.show(`${message}`, ToastAndroid.SHORT);
    };

    useFocusEffect(
        useCallback(() => {
            fetchRobots();
        }, [])
    );

    const addRobot = async () => {
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 'Accept': '*/*'
                },
                body: JSON.stringify({
                    name: String(newRobot.name || 'Robot'),
                    description: String(newRobot.description || 'A useful robot'),
                    price: parseFloat(newRobot.price || 12.99),
                    imageUrl: String(newRobot.imageUrl || 'https://images.dog.ceo/breeds/terrier-andalusian/images.jpg'),
                }),
            };
            // Call add from the API
            const res = await fetch(`${BASE_URL}/robot`, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setShowAddRobot(false); // Close the add menu
            setNewRobot({}); // Clear the robot values
            showToast('Robot Added Successfully!');
            router.replace(`/`);
        } catch (e) {
            showToast('Error Adding Robot.');
            console.log(e);
        }
    };

    useEffect(() => {
        fetchRobots();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchRobots();
        setRefreshing(false);
    }, []);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
                <Text style={styles.mono}>Loading from {BASE_URL}/localrobots…</Text>
                <StatusBar style="auto" />
            </View>
        );
    }

    if (err) {
        return (
            <View style={styles.center}>
                <Text style={[styles.mono, { color: 'crimson' }]}>Fetch error: {err}</Text>
                <Text style={styles.help}>
                    • Is your FastAPI running on port 8082?
                    {'\n'}• If on a real phone, replace HOST with your computer's LAN IP.
                    {'\n'}• Ensure CORS is enabled on the backend.
                </Text>
                <StatusBar style="auto" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Robots</Text>
            <FlatList
                data={robots}
                keyExtractor={(item, idx) => String(item.id ?? item._id ?? idx)}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.avatar} />}
                        <Pressable
                            style={{ flex: 1 }}
                            onPress={() => {
                                router.push({
                                    pathname: 'single',
                                    params: { id: item.id },
                                });
                            }}>
                            <Text style={styles.name}>{item.name}</Text>
                            <Text style={styles.desc}>{item.description}</Text>
                            {'price' in item && <Text style={styles.price}>${Number(item.price).toFixed(2)}</Text>}
                        </Pressable>
                    </View>
                )}
                ListEmptyComponent={<Text style={styles.mono}>No robots found.</Text>}
                contentContainerStyle={{ paddingBottom: 24 }}
            />
            <Portal>
                <Dialog visible={showAddRobot} onDismiss={() => setShowAddRobot(false)}>
                    <Dialog.Content>
                        <TextInput
                            mode="outlined"
                            label="Name"
                            value={newRobot.name || ''}
                            onChangeText={(t) => {
                                setNewRobot((prev) => ({ ...prev, name: t }));
                            }}
                        />
                        <TextInput
                            mode="outlined"
                            label="Description"
                            value={newRobot.description || ''}
                            onChangeText={(t) => {
                                setNewRobot((prev) => ({ ...prev, description: t }));
                            }}
                        />
                        <TextInput
                            mode="outlined"
                            label="Price"
                            value={newRobot.price || ''}
                            onChangeText={(t) => {
                                setNewRobot((prev) => ({ ...prev, price: t }));
                            }}
                        />
                        <TextInput
                            mode="outlined"
                            label="Image URL"
                            textContentType="URL"
                            value={newRobot.imageUrl || ''}
                            onChangeText={(t) => {
                                setNewRobot((prev) => ({ ...prev, imageUrl: t }));
                            }}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        {/* Confirm Button */}
                        <Button onPress={addRobot}>Confirm</Button>

                        {/* Close Button  */}
                        <Button
                            onPress={() => {
                                setShowAddRobot(false);
                                //setNewRobot({}); <==== here! -- Why? -- we reset it in the add function hbt
                                // So it doesn't display previously entered data when reopened
                            }}>
                            Close
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
            <FAB icon={'plus'} style={styles.addButton} onPress={() => setShowAddRobot(true)} />
            <StatusBar style="auto" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
        paddingHorizontal: 16,
    },
    addButton: {
		position: 'absolute',
		width: 56,
		height: 56,
		right: 20,
		bottom: 50,
		justifyContent: 'center',
		alignItems: 'center',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 16,
    },
    card: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: 'white',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        marginHorizontal: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    avatar: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#eee' },
    name: { fontSize: 18, fontWeight: '700' },
    desc: { marginTop: 2 },
    price: { marginTop: 6, fontWeight: '700' },
    mono: {
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        marginTop: 8,
    },
    help: { marginTop: 10, textAlign: 'center' },
});
