import { BASE_URL } from './config'
import React, { useEffect, useState, useCallback } from 'react'
import { StatusBar } from 'expo-status-bar'
import {
	StyleSheet,
	Text,
	View,
	FlatList,
	ActivityIndicator,
	Image,
	Platform,
	RefreshControl
} from 'react-native'

// Page Stack
// 1. Show All Robots (GET /robots)
// 2. Show One Robot (GET /robots/:name)
// 3. Add Robot (POST /robots)
// 4. Update Robot (PUT/PATCH /robots/:name)
// 5. Delete Robot (DELETE /robots/:name)

// Requirements
// 1. Navigation: Provide a home or menu screen with buttons: a) All, b) One, c) Add, d) Modify, e) Delete.
// 2. Selection Strategy: For One/Modify/Delete, show a searchable/selectable list of robots first; tap to select the target item.
// 3. Validation: Prevent empty fields; require valid price (number) and imageUrl (URL).
// 4. Loading & Errors: Show loading indicators; display backend errors (status + detail).

export default function App() {
	const [robots, setRobots] = useState([])
	const [loading, setLoading] = useState(true)
	const [err, setErr] = useState('')
	const [refreshing, setRefreshing] = useState(false)

	const fetchRobots = async () => {
		try {
			setErr('')
			const res = await fetch(`${BASE_URL}/robots`)
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const data = await res.json()
			setRobots(Array.isArray(data) ? data : [])
		} catch (e) {
			setErr(String(e))
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchRobots()
	}, [])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchRobots()
		setRefreshing(false)
	}, [])

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' />
				<Text style={styles.mono}>Loading from {BASE_URL}/localrobots…</Text>
				<StatusBar style='auto' />
			</View>
		)
	}

	if (err) {
		return (
			<View style={styles.center}>
				<Text style={[styles.mono, { color: 'crimson' }]}>
					Fetch error: {err}
				</Text>
				<Text style={styles.help}>
					• Is your FastAPI running on port 8082?
					{'\n'}• If on a real phone, replace HOST with your computer's LAN IP.
					{'\n'}• Ensure CORS is enabled on the backend.
				</Text>
				<StatusBar style='auto' />
			</View>
		)
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Robots</Text>
			<FlatList
				data={robots}
				keyExtractor={(item, idx) => String(item.id ?? item._id ?? idx)}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				renderItem={({ item }) => (
					<View style={styles.card}>
						{!!item.imageUrl && (
							<Image source={{ uri: item.imageUrl }} style={styles.avatar} />
						)}
						<View style={{ flex: 1 }}>
							<Text style={styles.name}>{item.name}</Text>
							<Text style={styles.desc}>{item.description}</Text>
							{'price' in item && (
								<Text style={styles.price}>
									${Number(item.price).toFixed(2)}
								</Text>
							)}
						</View>
					</View>
				)}
				ListEmptyComponent={<Text style={styles.mono}>No robots found.</Text>}
				contentContainerStyle={{ paddingBottom: 24 }}
			/>
			<StatusBar style='auto' />
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#2b2b2bff',
		paddingTop: 60,
		paddingHorizontal: 16,
		color: '#ffffff'
	},
	center: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		marginBottom: 16,
		color: '#ffffff'
	},
	card: {
		flexDirection: 'row',
		gap: 12,
		backgroundColor: 'white',
		padding: 12,
		borderRadius: 12,
		marginBottom: 12,
		elevation: 2,
		shadowColor: '#000',
		shadowOpacity: 0.08,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 2 },
		color: '#ffffff'
	},
	avatar: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#eee' },
	name: { fontSize: 18, fontWeight: '700' },
	desc: { color: '#ffffffff', marginTop: 2 },
	price: { marginTop: 6, fontWeight: '700' },
	mono: {
		fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
		marginTop: 8
	},
	help: { marginTop: 10, textAlign: 'center', color: '#ffffffff' }
})
