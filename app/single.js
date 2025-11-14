import { BASE_URL } from './config'
import React, { useEffect, useState, useCallback } from 'react'
import { StatusBar } from 'expo-status-bar'

import {
	StyleSheet,
	View,
	FlatList,
	Platform,
	RefreshControl,
	ToastAndroid
} from 'react-native'
import { Text, Avatar, ActivityIndicator, Portal, Dialog, MD3DarkTheme, MD3LightTheme, Card, Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
// 4. Loading & Errorors: Show loading indicators; display backend errorors (status + detail).

export default function Single() { 
	const router = useRouter();
	const { id } = useLocalSearchParams();
	const [robot, setRobot] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [refreshing, setRefreshing] = useState(false);
	const [willUpdate, setUpdate] = useState(false);
	const [willDelete, setDelete] = useState(false);


	
	const showToast = (message) => {
    	ToastAndroid.show(`${message}`, ToastAndroid.SHORT);
  	};

	const fetchRobot = async () => {
		try {
			setError('');
			const res = await fetch(`${BASE_URL}/robot/${id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setRobot(data);
		} catch (e) {
			setError(String(e))
		} finally {
			setLoading(false)
		}
	}

	

	const updateRobot = async () => {
		try {
			const options = {
  				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					// 'Accept': '*/*'
				},
				body: JSON.stringify({
					name: String(robot.name),
					description: String(robot.description),
					price: parseFloat(robot.price),
					imageUrl: String(robot.imageUrl),
					id: parseInt(robot.id)
				})
			};

			console.log("OPTIONS");
			console.log(options);
			setError('');
			// Call update from the API
			const res = await fetch(`${BASE_URL}/robot`, options);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			setRobot(data);
			setUpdate(false); // Close the update menu
			showToast("Robot Updated Successfully!");
			router.replace(`/single?id=${robot.id}`);
		}
		catch (e) {
			setError(String(e));
			showToast("Error Updating Robot.");
		}
	}

	const deleteRobot = async () => {
		// Call delete from the api
		try {
			setError('');
			// Call update from the API
			const res = await fetch(`${BASE_URL}/robot/${id}`, {
				method: 'DELETE'
			});
			if (!res.ok) {throw new Error(`HTTP ${res.status}`)
			}else{
				showToast("Robot Deleted Successfully")
				router.back();
			};
		} catch(e) {
			setDelete(false); // Close the delete confirmation
			// Display errors
			setError(String(e));
			showToast("Failed to delete robot.");
			console.log(e)
		}
		return;
	}

	useEffect(() => {
		fetchRobot()
	}, [])

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await fetchRobot()
		setRefreshing(false)
	}, [])

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size='large' />
				<Text style={styles.mono}>Loading from {BASE_URL}/robot/{id}…</Text>
				<StatusBar style='auto' />
			</View>
		)
	}

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={[styles.mono, { color: 'crimson' }]}>
					Fetch erroror: {error}
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
		<Card style={{ flex: 1, justifyContent: 'center' }}>
			<Card.Title titleVariant="displayLarge" title={`Robot: ${robot.name}`}/>
			<Card.Cover style={{height:"50%"}} source={{ uri: robot.imageUrl }} resizeMode="contain" />
			<Card.Content>
				<Text variant="headlineSmall">Description: <Text variant='bodyMedium'>{robot.description}</Text></Text>
				<Text variant="headlineSmall">Price: <Text variant='bodyMedium'>{robot.price}</Text></Text>
				{/* Update Form */}
					<Portal>
						<Dialog visible={willUpdate}>
							<Dialog.Content>
								<TextInput label="Name" value={robot.name} onChangeText={ (t) => { setRobot(prev => ({ ...prev, name: t })) } }/>
								<TextInput label="Description" value={robot.description} onChangeText={ (t) => { setRobot(prev => ({ ...prev, description: t })) } }/>
								<TextInput label="Price" value={`${robot.price}`} onChangeText={ (t) => { setRobot(prev => ({ ...prev, price: t })) } }/>
								<TextInput label="Image URL" textContentType="URL" value={robot.imageUrl} onChangeText={ (t) => { setRobot(prev => ({ ...prev, imageUrl: t })) } }/>
							</Dialog.Content>
							<Dialog.Actions>
								{/* Confirm Button */}
								<Button onPress={ updateRobot }>Confirm</Button>
								{/* Close Button */}
								<Button onPress={ () => setUpdate(false) }>Close</Button>
							</Dialog.Actions>
						</Dialog>
					</Portal>
			</Card.Content>
			<Card.Actions>
				{/* Update Button */}
				{ !willDelete && !willUpdate && <Button onPress={ () => setUpdate(true) }>Update</Button> }
				{/* Delete Button */}
				{ !willDelete && !willUpdate && <Button onPress={ () => setDelete(true) }>Delete</Button> }
				{/* ¯\_(ツ)_/¯ */}
				{/* Confirm Button */}
				{ willDelete && <Button mode='outlined' onPress={ deleteRobot }>Confirm</Button> }
				{/* Cancel Button */}
				{ willDelete && <Button  onPress={ () => setDelete(false) }>Cancel</Button> }
			</Card.Actions>
		</Card>
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
	row: {
		flex: 1,
		flexDirection: 'row',
		justifyContent: 'center'
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
