import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, StyleSheet, ToastAndroid } from "react-native";
import { Text, TextInput, Button } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import SelectMedia from "../components/SelectMedia";
import MediaBar from "../components/MediaBar";
import { useRouter } from "expo-router";
import { useAsyncStorage } from '@react-native-async-storage/async-storage';
import { USERNAME } from './config';

export default function App() {
	const router = useRouter();
	const ws = useRef(null);
	const [isConnected, setIsConnected] = useState(false);
	const [username, setUsername] = useState("");
	const [inputMedia, setInputMedia] = useState([]);
	const [messages, setMessages] = useState([]);

	const loadUsername = async () => {
		const result = await useAsyncStorage(USERNAME).getItem();
		
		// Check that the result was not an error
		if (typeof result == 'string')  {
			setUsername(result); 
			console.log(`Updated Username: ${result}`);
		}
		// Log any errors
		else if (result != null) {
			console.warn(result);
		}
	}

	const saveUsername = async () => {
		const result = await useAsyncStorage(USERNAME).setItem(username);
		
		// Check that the result was not an error
		if (typeof result == 'string')  {
			setUsername(result); 
			console.log(`Updated Username: ${result}`);
		}
		else if (result != null) {
			console.warn(result);
		}
	}

	// Load the username on render
	useEffect(() => {
		loadUsername();
	}, [])

	const handleOpenChat = async () => {
		await saveUsername();

		if (username.length > 2 && username.length <= 16) {
			router.push("/chat");
		}
	}

	return (
		<SafeAreaView style={styles.container}>
			<Text style={styles.title}>Enter a username to join the chat!</Text>

			<View style={styles.inputRow}>
				<TextInput
					label="Username"
					style={styles.input}
					placeholder="Enter your name..."
					value={username}
					onChangeText={(text) => setUsername(text)}
					onSubmitEditing={handleOpenChat}
				/>
				<Button mode="contained" onPress={handleOpenChat}>Send</Button>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		backgroundColor: "#f0f4ff",
	},
	title: {
		fontSize: 20,
		fontWeight: "800",
		marginBottom: 4,
		textAlign: "center",
	},
	status: {
		fontSize: 14,
		textAlign: "center",
		marginBottom: 12,
	},
	messagesContainer: {
		flex: 1,
		borderWidth: 1,
		borderColor: "#ddd",
		borderRadius: 8,
		padding: 8,
		backgroundColor: "#ffffff",
	},
	messageBubble: {
		marginVertical: 4,
		padding: 6,
		borderRadius: 6,
	},
	myMessage: {
		alignSelf: "flex-end",
		backgroundColor: "#d4f8d4",
	},
	serverMessage: {
		alignSelf: "center",
		backgroundColor: "#d4e4ff",
	},
	systemMessage: {
		alignSelf: "center",
		backgroundColor: "#fce5cd",
	},
	userMessage: {
		alignSelf: "flex-start",
		backgroundColor: "#fccddcff",
	},
	messageFrom: {
		fontSize: 10,
		opacity: 0.6,
	},
	messageText: {
		fontSize: 14,
	},
	inputRow: {
		flexDirection: "row",
		marginTop: 8,
		alignItems: "center",
		gap: 8,
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderColor: "#aaa",
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 2,
		backgroundColor: "#ffffff",
	},
	buttonRow: {
		marginTop: 8,
	},
});
