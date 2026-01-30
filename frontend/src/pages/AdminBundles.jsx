import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

const PLACEHOLDER_BUNDLES = [
  {
    id: 288,
    name: '12 Hours Unlimited',
    subtitleLines: ['Ntiwuguzirwa', 'Philemon'],
    durationBadge: '1.7 day(s)',
    price: '1,000 UGX',
    vouchers: '126 / 277',
    status: 'Active',
  },
  {
    id: 287,
    name: '2 Hours Unlimited',
    subtitleLines: ['Ntiwuguzirwa', 'Philemon'],
    durationBadge: '24 min(s)',
    price: '500 UGX',
    vouchers: '422 / 597',
    status: 'Active',
  },
  {
    id: 197,
    name: 'Monthly Unlimited',
    subtitleLines: ['Monthly Unlimited'],
    durationBadge: '16.7 day(s)',
    price: '23,000 UGX',
    vouchers: '91 / 91',
    status: 'Active',
  },
  {
    id: 196,
    name: 'Weekly Unlimited',
    subtitleLines: ['Weekly Unlimited'],
    durationBadge: '7 day(s)',
    price: '6,000 UGX',
    vouchers: '86 / 95',
    status: 'Active',
  },
  {
    id: 195,
    name: 'Daily Unlimited',
    subtitleLines: ['Daily Unlimited'],
    durationBadge: '1 day(s)',
    price: '1,500 UGX',
    vouchers: '369 / 471',
    status: 'Active',
  },
];

function FieldLabel({ children }) {
  return (
    <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
      {children}
    </Typography>
  );
}

function Badge({ label, color = '#0ea5e9' }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 20,
        fontWeight: 800,
        fontSize: 11,
        bgcolor: color,
        color: 'common.white',
        borderRadius: 999,
        '& .MuiChip-label': { px: 1, py: 0 },
      }}
    />
  );
}

function StatusChip({ status }) {
  const normalized = String(status ?? '').toLowerCase();
  const isActive = normalized === 'active';

  return (
    <Chip
      size="small"
      label={isActive ? '✓ Active' : status}
      sx={{
        height: 20,
        fontWeight: 800,
        fontSize: 11,
        bgcolor: isActive ? '#15803d' : 'grey.300',
        color: isActive ? 'common.white' : 'text.primary',
        borderRadius: 999,
        '& .MuiChip-label': { px: 1, py: 0 },
      }}
    />
  );
}

export default function AdminBundles() {
  return (
    <Box sx={{ width: '100%', pt: 1, pb: 4, px: 0 }}>
      <Typography variant="h4" sx={{ fontWeight: 900, mb: 2 }}>
        Manage Bundles
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: '520px 1fr',
          },
          alignItems: 'start',
        }}
      >
        {/* Left: Create New Bundle */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: '1px solid #e5e7eb',
            bgcolor: 'common.white',
            minWidth: 0,
          }}
        >
          <Stack spacing={2} sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              Create New Bundle
            </Typography>

            <Stack spacing={0.75}>
              <FieldLabel>Bundle Name</FieldLabel>
              <TextField size="small" placeholder="" fullWidth />
            </Stack>

            <Stack spacing={0.75}>
              <FieldLabel>Duration (minutes)</FieldLabel>
              <TextField size="small" placeholder="" fullWidth />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Example: 60 for 1 hour, 1440 for 1 day, 10080 for 1 week
              </Typography>
            </Stack>

            <Stack spacing={0.75}>
              <FieldLabel>Price (UGX)</FieldLabel>
              <TextField size="small" placeholder="" fullWidth />
            </Stack>

            <Stack spacing={0.75}>
              <FieldLabel>Description</FieldLabel>
              <TextField size="small" placeholder="" fullWidth multiline minRows={4} />
            </Stack>

            <Button
              fullWidth
              variant="contained"
              onClick={() => console.log('[bundles] create bundle (placeholder)')}
              sx={{
                mt: 0.5,
                bgcolor: '#2563eb',
                fontWeight: 900,
                textTransform: 'none',
                borderRadius: 1,
                py: 1.1,
                '&:hover': { bgcolor: '#1d4ed8' },
              }}
            >
              Create Bundle
            </Button>
          </Stack>
        </Paper>

        {/* Right: Your Bundles */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: '1px solid #e5e7eb',
            bgcolor: 'common.white',
            minWidth: 0,
          }}
        >
          <Stack spacing={2} sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Your Bundles
              </Typography>
              <Chip
                size="small"
                label={`${PLACEHOLDER_BUNDLES.length} bundle(s) found`}
                sx={{
                  height: 22,
                  fontWeight: 900,
                  fontSize: 12,
                  bgcolor: '#06b6d4',
                  color: 'common.white',
                  borderRadius: 1,
                }}
              />
            </Box>

            <Paper
              elevation={0}
              sx={{
                borderRadius: 1.5,
                border: '1px solid #e5e7eb',
                bgcolor: '#f8fafc',
                p: 2,
              }}
            >
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-end' }}>
                  <Box sx={{ flex: 1 }}>
                    <FieldLabel>Search Bundles</FieldLabel>
                    <TextField
                      size="small"
                      placeholder="Search by name, description, ID..."
                      fullWidth
                      sx={{ mt: 0.75, bgcolor: 'common.white' }}
                    />
                  </Box>

                  <Box sx={{ width: { xs: '100%', md: 220 } }}>
                    <FieldLabel>Status Filter</FieldLabel>
                    <FormControl size="small" fullWidth sx={{ mt: 0.75, bgcolor: 'common.white' }}>
                      <InputLabel id="status-filter">All Statuses</InputLabel>
                      <Select labelId="status-filter" label="All Statuses" value="">
                        <MenuItem value="">All Statuses</MenuItem>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="disabled">Disabled</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Box sx={{ width: { xs: '100%', md: 120 } }}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={() => console.log('[bundles] search (placeholder)')}
                      sx={{
                        bgcolor: '#2563eb',
                        fontWeight: 900,
                        textTransform: 'none',
                        borderRadius: 1,
                        py: 0.9,
                        '&:hover': { bgcolor: '#1d4ed8' },
                      }}
                    >
                      Search
                    </Button>
                  </Box>
                </Stack>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    onClick={() => console.log('[bundles] reset (placeholder)')}
                    sx={{
                      textTransform: 'none',
                      borderRadius: 1,
                      py: 0.75,
                      px: 2.5,
                      borderColor: '#cbd5e1',
                      color: '#334155',
                      bgcolor: 'common.white',
                      '&:hover': { borderColor: '#94a3b8', bgcolor: 'common.white' },
                    }}
                  >
                    Reset
                  </Button>
                </Box>
              </Stack>
            </Paper>

            <Divider sx={{ borderColor: '#eef2f7' }} />

            <TableContainer
              sx={{
                width: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <Table
                size="small"
                sx={{
                  width: 'max-content',
                  tableLayout: 'fixed',
                  minWidth: { xs: 760, sm: 840, md: 900 },
                }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 900, width: 56, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      #
                      <br />
                      ID
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 900,
                        width: { xs: 160, sm: 210, md: 260 },
                        px: { xs: 0.75, sm: 1 },
                        py: 0.75,
                      }}
                    >
                      Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, width: 96, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      Duration
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, width: 100, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      Price
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, width: 140, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      Vouchers
                      <br />
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        (Available/Total)
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, width: 92, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      Status
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900, width: 108, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {PLACEHOLDER_BUNDLES.map((b) => (
                    <TableRow key={b.id} hover>
                      <TableCell sx={{ fontWeight: 700, px: { xs: 0.75, sm: 1 }, py: 0.75 }}>{b.id}</TableCell>

                      <TableCell sx={{ px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                        <Stack spacing={0.15}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 900,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.15,
                            }}
                          >
                            {b.name}
                          </Typography>
                          {b.subtitleLines?.map((line, idx) => (
                            <Typography
                              key={idx}
                              variant="caption"
                              sx={{ color: 'text.secondary', lineHeight: 1.1 }}
                            >
                              {line}
                            </Typography>
                          ))}
                        </Stack>
                      </TableCell>

                      <TableCell sx={{ px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                        <Badge label={b.durationBadge} color="#06b6d4" />
                      </TableCell>

                      <TableCell
                        sx={{
                          fontWeight: 900,
                          px: { xs: 0.75, sm: 1 },
                          py: 0.75,
                          wordBreak: 'break-word',
                        }}
                      >
                        {b.price}
                      </TableCell>

                      <TableCell sx={{ px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                        <Badge label={b.vouchers} color="#2563eb" />
                      </TableCell>

                      <TableCell sx={{ px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                        <StatusChip status={b.status} />
                      </TableCell>

                      <TableCell sx={{ px: { xs: 0.75, sm: 1 }, py: 0.75 }}>
                        <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => console.log('[bundles] edit', b.id)}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 1,
                              borderColor: '#22c55e',
                              color: '#15803d',
                              bgcolor: 'common.white',
                              minWidth: 86,
                              minHeight: 28,
                              py: 0.25,
                              px: 1,
                              '&:hover': { borderColor: '#16a34a', bgcolor: 'common.white' },
                            }}
                          >
                            Edit
                          </Button>

                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => console.log('[bundles] disable', b.id)}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 1,
                              borderColor: '#3b82f6',
                              color: '#2563eb',
                              bgcolor: 'common.white',
                              minWidth: 86,
                              minHeight: 28,
                              py: 0.25,
                              px: 1,
                              '&:hover': { borderColor: '#2563eb', bgcolor: 'common.white' },
                            }}
                          >
                            Disable
                          </Button>

                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => console.log('[bundles] delete', b.id)}
                            sx={{
                              textTransform: 'none',
                              borderRadius: 1,
                              borderColor: '#fb7185',
                              color: '#ef4444',
                              bgcolor: 'common.white',
                              minWidth: 86,
                              minHeight: 28,
                              py: 0.25,
                              px: 1,
                              '&:hover': { borderColor: '#ef4444', bgcolor: 'common.white' },
                            }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
