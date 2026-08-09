import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Center,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { login } from '../auth/authClient'

interface LoginFormValues {
  username: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<LoginFormValues>({
    initialValues: { username: '', password: '' },
    validate: {
      username: (value) => (value.trim() ? null : 'Username is required'),
      password: (value) => (value ? null : 'Password is required'),
    },
  })

  async function handleSubmit(values: LoginFormValues) {
    setError(null)
    setSubmitting(true)
    const ok = await login(values.username, values.password)
    setSubmitting(false)

    if (ok) {
      navigate('/', { replace: true })
    } else {
      setError('Incorrect username or password.')
    }
  }

  return (
    <Center h="100vh">
      <Paper withBorder shadow="md" p="xl" w={360}>
        <Title order={2} mb="md">
          Log in
        </Title>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput label="Username" {...form.getInputProps('username')} />
          <PasswordInput
            label="Password"
            mt="sm"
            {...form.getInputProps('password')}
          />
          {error && (
            <Text c="red" size="sm" mt="sm">
              {error}
            </Text>
          )}
          <Button type="submit" fullWidth mt="lg" loading={submitting}>
            Log in
          </Button>
        </form>
      </Paper>
    </Center>
  )
}
