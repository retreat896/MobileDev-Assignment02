import { Stack, Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function Layout() {
    // Page Stack
    // 1. Show All Robots (GET /robots)
    // 2. Show One Robot (GET /robots/:name)
    // 3. Add Robot (POST /robots)
    // 4. Update Robot (PUT/PATCH /robots/:name)
    // 5. Delete Robot (DELETE /robots/:name)
    return (
        <Stack>
            {/* Show All Robots (GET /robots) */}
            <Stack.Screen
                name="index"
                options={{
                    title: 'Robots',
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#fff',
                }}
            />
            {/* Show One Robot (GET /robots/:name) */}
            <Stack.Screen
                name="single"
                options={{
                    title: 'Show One Robot (GET /robots/:name)',
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#fff',
                }}
            />
            {/* Add Robot (POST /robots) */}
            <Stack.Screen
                name="add"
                options={{
                    title: 'Add Robot (POST /robots)',
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#fff',
                }}
            />
            {/* Update Robot (PUT/PATCH /robots/:name) */}
            <Stack.Screen
                name="update"
                options={{
                    title: 'Update Robot (PUT/PATCH /robots/:name)',
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#fff',
                }}
            />
            {/* Delete Robot (DELETE /robots/:name) */}
            <Stack.Screen
                name="remove"
                options={{
                    title: 'Delete Robot',
                    headerStyle: { backgroundColor: '#111827' },
                    headerTintColor: '#fff',
                }}
            />
        </Stack>
    );
}
