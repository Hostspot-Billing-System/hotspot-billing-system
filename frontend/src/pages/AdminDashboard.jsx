import { Container, Divider, Paper, Stack, Typography } from '@mui/material';
import VoucherRedeem from '../components/VoucherRedeem';

export default function AdminDashboard() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={700}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Phase 6: use the sidebar to manage voucher batches and vouchers.
          </Typography>

          <Divider />
          <VoucherRedeem />
        </Stack>
      </Paper>
    </Container>
  );
}
