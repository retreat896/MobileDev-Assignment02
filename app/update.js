import { BASE_URL } from './config'
import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator
} from 'react-native'

export default function EditRobot () {
  console.log('BASE_URL loaded:', BASE_URL) // <-- Add this line

  const [robots, setRobots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState(null)

  // form fields
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${BASE_URL}/robots`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRobots(Array.isArray(data) ? data : [])
    } catch (e) {
      Alert.alert('Error', String(e.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pick = item => {
    // Keep the key used in the URL path immutable (trim to avoid trailing-space bugs)
    const key = (item?.name || '').trim()
    setSelectedName(key)

    // Prefill the form (name shown as read-only)
    setName(key || '')
    setPrice(item?.price != null ? String(item.price) : '')
    setDescription(item?.description ?? '')
    setImageUrl(item?.imageUrl ?? '')
  }

  const update = async () => {
    if (!selectedName) {
      Alert.alert('Select a robot', 'Tap a robot from the list first.')
      return
    }

    // Validate and build the FULL body (because backend expects the full Robot model)
    const parsedPrice = Number(price)
    if (Number.isNaN(parsedPrice)) {
      Alert.alert('Validation', 'Price must be a number.')
      return
    }

    const body = {
      name, // read-only in UI, but send it (backend ignores changing name)
      price: parsedPrice,
      description: description ?? '',
      imageUrl: imageUrl ?? ''
    }

    // DEBUG: Log what we're sending
    console.log('Selected name for URL:', selectedName)
    console.log('Body being sent:', body)
    console.log(
      'Full URL:',
      `${BASE_URL}/robots/${encodeURIComponent(selectedName)}`
    )

    try {
      const res = await fetch(
        `${BASE_URL}/robots/${encodeURIComponent(selectedName)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      )

      console.log('Response status:', res.status)

      if (res.ok) {
        Alert.alert('Updated', 'Robot updated successfully')
        await load() // refresh list with new values
      } else {
        const err = await res.json().catch(() => ({}))
        console.log('Error response:', err)
        Alert.alert('Error', err.detail || `HTTP ${res.status}`)
      }
    } catch (e) {
      console.log('Network error:', e)
      Alert.alert('Network Error', String(e.message))
    }
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[s.card, selectedName === (item?.name || '').trim() && s.selected]}
      onPress={() => pick(item)}
    >
      {!!item?.imageUrl && (
        <Image source={{ uri: item.imageUrl }} style={s.thumb} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{item?.name}</Text>
        {'price' in item && (
          <Text style={s.price}>${Number(item.price).toFixed(2)}</Text>
        )}
        {!!item?.description && (
          <Text numberOfLines={1} style={s.desc}>
            {item.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size='large' />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>Tap a robot to edit</Text>
      <FlatList
        data={robots}
        keyExtractor={(item, i) => item?.name ?? String(i)} // use name as key
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 12 }}
        ListEmptyComponent={<Text>No robots yet.</Text>}
      />

      <Text style={s.sectionTitle}>Edit fields</Text>

      {/* NAME: read-only */}
      <TextInput
        style={[s.input, { backgroundColor: '#f3f4f6' }]}
        value={name}
        editable={false}
        placeholder='Name (read-only)'
      />

      <TextInput
        style={s.input}
        value={price}
        onChangeText={setPrice}
        placeholder='Price'
        keyboardType='numeric'
      />
      <TextInput
        style={s.input}
        value={description}
        onChangeText={setDescription}
        placeholder='Description'
      />
      <TextInput
        style={s.input}
        value={imageUrl}
        onChangeText={setImageUrl}
        placeholder='Image URL'
        autoCapitalize='none'
      />

      <TouchableOpacity style={s.btn} onPress={update}>
        <Text
          style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}
        >
          Update
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fafafa' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8
  },
  card: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee'
  },
  selected: { borderColor: '#111827', borderWidth: 2 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  name: { fontWeight: '700' },
  price: { marginTop: 2, fontWeight: '600' },
  desc: { color: '#444', marginTop: 2 },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8
  },
  btn: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4
  }
})
