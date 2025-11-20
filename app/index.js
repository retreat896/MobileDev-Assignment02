import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, StyleSheet, ToastAndroid } from "react-native";
import { Text, TextInput, Button } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import SelectMedia from "../components/SelectMedia";
import MediaBar from "../components/MediaBar";

//  IMPORTANT: adjust this address based on how you run it
// For Android emulator: ws://10.0.2.2:8089/ws
// For same machine (web preview): ws://localhost:8089/ws
// For real device: ws://YOUR_LOCAL_IP:8089/ws
const WS_URL = "ws://mullet-deep-explicitly.ngrok-free.app/ws";

export default function App() {
	const ws = useRef(null);

	const [isConnected, setIsConnected] = useState(false);
	const [inputText, setInputText] = useState("");
	const [inputMedia, setInputMedia] = useState([]);
	const [messages, setMessages] = useState([]); // {id, from, text}

	// Connect to WebSocket when component mounts
	useEffect(() => {
		connectWebSocket();

		// Cleanup on unmount
		return () => {
			if (ws.current) {
				ws.current.close();
			}
		};
	}, []);

	const connectWebSocket = () => {
		// Close previous connection if any
		if (ws.current) {
			ws.current.close();
		}

		console.log("Connecting to:", WS_URL);
		ws.current = new WebSocket(WS_URL);

		ws.current.onopen = () => {
			console.log("WebSocket connected");
			setIsConnected(true);
			addMessage("system", "Connected to server");
		};

		ws.current.onmessage = (event) => {
			const data = JSON.parse(event.data)
			console.log("Received:", data);
			if (data.message) addMessage(data.username, data.message);
			// if (data.image) addImage(data.username, data.image);
		};

		ws.current.onerror = (error) => {
			console.log("WebSocket error:", error.message);
			addMessage("system", "WebSocket error. See console.");
		};

		ws.current.onclose = () => {
			console.log("WebSocket closed");
			setIsConnected(false);
			addMessage("system", "Disconnected from server ");
		};
	};

	const addMessage = (from, text) => {
		setMessages((prev) => [
			...prev,
			{
				id: Date.now().toString() + Math.random().toString(),
				from,
				text,
			},
		]);
	};

	const sendMessage = () => {
		if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
			addMessage("system", "Not connected. Trying to reconnect...");
			connectWebSocket();
			return;
		}

		if (!inputText.trim()) return;

		const msg = inputText.trim();
		// Add locally
		addMessage("me", msg);
		// Send to server
		ws.current.send(JSON.stringify({ username: 'bob', message: msg }));
		setInputText("");
	};

	const addMediaInput = (media) => {
		// Ignore media that was already added
		if (inputMedia.includes(media)) return;

		// Add the photo to the media list
		setInputMedia((inputList) => [ ...inputList, media ]);
		console.log("Added Item");
	}

	return (
		<SafeAreaView style={styles.container}>
			<Text style={styles.title}>React Native + FastAPI WebSocket</Text>
			<Text style={styles.status}>
				Status: {isConnected ? "😃 Connected" : "😔 Disconnected"}
			</Text>

			<View style={styles.messagesContainer}>
				
				<FlatList
					data={messages}
					keyExtractor={(item) => item.id}
					renderItem={({ item }) => (
						<View
							style={[
								styles.messageBubble,
								item.from === "me"
									? styles.myMessage
								: item.from === "server"
									? styles.serverMessage
								: item.from === "system"
									? styles.systemMessage
								: styles.userMessage
							]}
						>
							<Text variant="bodySmall" style={styles.messageFrom}>{item.from.toUpperCase()}:</Text>
							<Text variant="bodyLarge" style={styles.messageText}>{item.text}</Text>
						</View>
					)}
				/>
			</View>


			<View style={styles.buttonRow}>
				<MediaBar 
					thumbnailSize={120}
					media={inputMedia} 
					removeItem={(removed) => {
						// Update the input
						// Filter all except the removed item
						setInputMedia((input) => input.filter(media => media !== removed));
						console.log("Removed Item");
					}}
				/>
			</View>

			<View style={styles.inputRow}>
				<SelectMedia
					saveMedia={true}
					limit={4}

					photoSelected={addMediaInput}
					
					photoTaken={addMediaInput}
				/>
				
				<TextInput
					label="Message"
					style={styles.input}
					placeholder="Type a message..."
					value={inputText}
					onChangeText={(t) => setInputText(text => t)}
				/>
				<Button mode="contained" onPress={sendMessage}>Send</Button>
			</View>

			<View style={styles.buttonRow}>
				<Button mode="outlined" onPress={connectWebSocket}>Reconnect</Button>
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
