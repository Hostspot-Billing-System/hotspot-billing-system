import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { fetchPackages } from '../services/packages';
import { uploadVouchersCsv } from '../services/vouchers';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message = data?.error?.message ?? err?.message ?? 'Request failed';
  return { code, message };
}

export default function AdminVoucherUpload() {
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState(null);

  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [file, setFile] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPackagesLoading(true);
      setPackagesError(null);
      try {
        const data = await fetchPackages();
        if (cancelled) return;
        setPackages(Array.isArray(data?.packages) ? data.packages : []);
      } catch (err) {
        if (cancelled) return;
        setPackagesError(extractBackendError(err));
      } finally {
        if (!cancelled) setPackagesLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUpload = useMemo(() => {
    return Boolean(selectedPackageId) && Boolean(file) && !uploading;
  }, [selectedPackageId, file, uploading]);

  async function onUpload() {
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await uploadVouchersCsv({
        packageId: selectedPackageId,
        file,
      });
      setSuccess({ inserted: data?.inserted, batch_id: data?.batch_id });
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e) {
    const chosen = e.target.files?.[0] ?? null;
    setSuccess(null);
    setError(null);

    if (!chosen) {
      setFile(null);
      return;
    }

    if (!chosen.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setError({ code: 'INVALID_FILE', message: 'Please select a .csv file' });
      return;
    }

    setFile(chosen);
  }

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Voucher Upload
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Select a package, choose a CSV file, then upload vouchers.
            </Typography>
          </Box>

          {packagesError ? (
            <Alert severity="error">
              <Typography variant="body2" fontWeight={700}>
                {packagesError.code}
              </Typography>
              <Typography variant="body2">{packagesError.message}</Typography>
            </Alert>
          ) : null}

          <FormControl fullWidth disabled={packagesLoading}>
            <InputLabel id="package-label">Select Package</InputLabel>
            <Select
              labelId="package-label"
              label="Select Package"
              value={selectedPackageId}
              onChange={(e) => {
                setSelectedPackageId(e.target.value);
                setSuccess(null);
                setError(null);
              }}
            >
              {packages.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.duration_minutes} mins)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Button variant="outlined" component="label">
              Choose CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={onFileChange} />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {file ? file.name : 'No file selected'}
            </Typography>
          </Stack>

          <Box>
            <Button
              variant="contained"
              onClick={onUpload}
              disabled={!canUpload}
              startIcon={uploading ? <CircularProgress size={18} /> : null}
            >
              {uploading ? 'Uploading…' : 'Upload Vouchers'}
            </Button>
          </Box>

          {success ? (
            <Alert severity="success">
              <Typography variant="body2">
                Inserted: <strong>{success.inserted}</strong>
              </Typography>
              <Typography variant="body2">
                Batch ID: <strong>{success.batch_id}</strong>
              </Typography>
            </Alert>
          ) : null}

          {error ? (
            <Alert severity="error">
              <Typography variant="body2" fontWeight={700}>
                {error.code}
              </Typography>
              <Typography variant="body2">{error.message}</Typography>
            </Alert>
          ) : null}

          {packagesLoading ? (
            <Alert severity="info">Loading packages…</Alert>
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
