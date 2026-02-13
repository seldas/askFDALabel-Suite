'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import {
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Box,
  Chip,
  Drawer,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  Autocomplete,
  Stack,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
  Card,
  CardContent,
  Tabs,
  Tab,
  GlobalStyles,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
} from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import Grid from '@mui/material/GridLegacy'; 
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ScienceIcon from '@mui/icons-material/Science';
import HistoryIcon from '@mui/icons-material/History';
import InfoIcon from '@mui/icons-material/Info';
import DescriptionIcon from '@mui/icons-material/Description';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NoteIcon from '@mui/icons-material/Note';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListIcon from '@mui/icons-material/List';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import GavelIcon from '@mui/icons-material/Gavel';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useUser } from '../context/UserContext';
import Link from 'next/link';
import debounce from 'lodash/debounce';

// Interfaces
interface DrugSummary {
  SETID: string;
  Trade_Name: string;
  Generic_Proper_Names: string;
  Toxicity_Class: string;
  Author_Organization: string;
  Tox_Type: string;
  SPL_Effective_Time: string;
  Changed: string;
  is_historical: number;
}

interface DrugDetail extends DrugSummary {
  PLR: number;
  Evidence: string;
  Supported_Section: string;
  Update_Notes: string;
  AI_Summary: string;
}

interface HistoryItem {
  SETID: string;
  Toxicity_Class: string;
  SPL_Effective_Time: string;
  is_historical: number;
  Changed: string;
  Update_Notes: string;
  Trade_Name: string;
  Author_Organization: string;
}

interface MarketItem {
  SETID: string;
  Trade_Name: string;
  Author_Organization: string;
  Toxicity_Class: string;
  SPL_Effective_Time: string;
}

interface DiscrepancyItem {
  generic_name: string;
  tox_range: string;
  severity_gap: number;
  manufacturer_count: number;
  classes_found: string[];
  details: { Trade_Name: string; Author_Organization: string; Toxicity_Class: string; SETID: string }[];
}

interface Stats {
  distribution: { Toxicity_Class: string; count: number }[];
  total_changes: number;
}

interface CompanyStats {
  distribution: { Toxicity_Class: string; count: number }[];
  total_drugs: number;
}

const API_BASE = '/api/drugtox';

export default function DrugToxPage() {
  const theme = useTheme();
  const { session, updateAiProvider } = useUser();
  const [activeTab, setActiveTab] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [toxType, setToxType] = useState<string | null>('DILI');
  const [showHistorical, setShowHistorical] = useState(false);
  const [changedOnly, setChangedOnly] = useState(false);
  const [drugs, setDrugs] = useState<DrugSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [selectedSetid, setSelectedSetid] = useState<string | null>(null);
  const [detail, setDetail] = useState<DrugDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [market, setMarket] = useState<MarketItem[]>([]);

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [companyPortfolio, setCompanyPortfolio] = useState<DrugSummary[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);

  // Discrepancy State
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>('ALL');

  const COLORS: Record<string, string> = {
    Most: '#c62828',
    Less: '#ef6c00',
    No: '#2e7d32',
    Precaution: '#1565c0',
    Unknown: '#757575',
  };

  const fetchStats = useCallback((currentTox: string | null) => {
    setStatsLoading(true);
    axios
      .get(`${API_BASE}/stats`, { params: { tox_type: currentTox } })
      .then((res) => {
        setStats({
          ...res.data,
          distribution: res.data.distribution.sort((a: any, b: any) => b.count - a.count),
        });
        setStatsLoading(false);
      })
      .catch((err) => console.error(err));
  }, []);

  const fetchDiscrepancies = useCallback((currentTox: string | null) => {
    setDiscrepancyLoading(true);
    axios
      .get(`${API_BASE}/discrepancies`, { params: { tox_type: currentTox } })
      .then((res) => {
        setDiscrepancies(res.data);
        setDiscrepancyLoading(false);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    fetchStats(toxType);
    if (activeTab === 2) fetchDiscrepancies(toxType);
  }, [toxType, activeTab, fetchStats, fetchDiscrepancies]);

  const filteredDiscrepancies = useMemo(() => {
    if (severityFilter === 'ALL') return discrepancies;
    if (severityFilter === 'HIGH') return discrepancies.filter((d) => d.severity_gap >= 3);
    if (severityFilter === 'MEDIUM') return discrepancies.filter((d) => d.severity_gap === 2);
    if (severityFilter === 'LOW') return discrepancies.filter((d) => d.severity_gap === 1);
    return discrepancies;
  }, [discrepancies, severityFilter]);

  const fetchSuggestions = useCallback(
    debounce((input: string) => {
      if (input.length < 2) {
        setOptions([]);
        return;
      }
      axios
        .get(`${API_BASE}/autocomplete?q=${encodeURIComponent(input)}`)
        .then((response) => setOptions(response.data))
        .catch((err) => console.error(err));
    }, 300),
    []
  );

  useEffect(() => {
    fetchSuggestions(inputValue);
  }, [inputValue, fetchSuggestions]);

  const fetchDrugs = (
    searchQuery: string,
    currentToxType: string | null,
    includeHistory: boolean,
    changesOnly: boolean,
    currentPage: number,
    limit: number
  ) => {
    setLoading(true);
    setHasSearched(true);
    axios
      .get(`${API_BASE}/drugs`, {
        params: {
          q: searchQuery || undefined,
          tox_type: currentToxType || undefined,
          show_historical: includeHistory,
          changed_only: changesOnly,
          page: currentPage + 1,
          limit: limit,
        },
      })
      .then((response) => {
        setDrugs(response.data.items);
        setTotal(response.data.total);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching drugs:', error);
        setLoading(false);
      });
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPage(0);
    setActiveTab(1);
    fetchDrugs(query, toxType, showHistorical, changedOnly, 0, rowsPerPage);
  };

  const handleToxTypeChange = (_event: React.MouseEvent<HTMLElement>, newToxType: string | null) => {
    if (newToxType !== null) {
      setToxType(newToxType);
      setPage(0);
      if (activeTab === 1) {
        fetchDrugs(query, newToxType, showHistorical, changedOnly, 0, rowsPerPage);
      }
    }
  };

  const handleHistoricalToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setShowHistorical(newValue);
    setPage(0);
    fetchDrugs(query, toxType, newValue, changedOnly, 0, rowsPerPage);
  };

  const handleChangedOnlyToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setChangedOnly(newValue);
    setPage(0);
    setActiveTab(1);
    fetchDrugs(query, toxType, showHistorical, newValue, 0, rowsPerPage);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
    fetchDrugs(query, toxType, showHistorical, changedOnly, newPage, rowsPerPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    fetchDrugs(query, toxType, showHistorical, changedOnly, 0, newRowsPerPage);
  };

  useEffect(() => {
    if (selectedSetid) {
      setDetailLoading(true);
      Promise.all([
        axios.get(`${API_BASE}/drugs/${selectedSetid}`, { params: { tox_type: toxType } }),
        axios.get(`${API_BASE}/drugs/${selectedSetid}/history`, { params: { tox_type: toxType } }),
        axios.get(`${API_BASE}/drugs/${selectedSetid}/market`, { params: { tox_type: toxType } }),
      ])
        .then(([detailRes, historyRes, marketRes]) => {
          setDetail(detailRes.data);
          setHistory(historyRes.data);
          setMarket(marketRes.data);
          setDetailLoading(false);
        })
        .catch((error) => {
          console.error('Error fetching drug info:', error);
          setDetailLoading(false);
        });
    } else {
      setDetail(null);
      setHistory([]);
      setMarket([]);
    }
  }, [selectedSetid, toxType]);

  useEffect(() => {
    if (selectedCompany) {
      setCompanyLoading(true);
      Promise.all([
        axios.get(`${API_BASE}/companies/${encodeURIComponent(selectedCompany)}/stats`, { params: { tox_type: toxType } }),
        axios.get(`${API_BASE}/companies/${encodeURIComponent(selectedCompany)}/portfolio`, { params: { tox_type: toxType } }),
      ])
        .then(([statsRes, portfolioRes]) => {
          setCompanyStats(statsRes.data);
          setCompanyPortfolio(portfolioRes.data);
          setCompanyLoading(false);
        })
        .catch((err) => {
          console.error('Error fetching company info:', err);
          setCompanyLoading(false);
        });
    }
  }, [selectedCompany, toxType]);

  const getToxColor = (toxClass: string) => {
    if (!toxClass) return 'default';
    const lower = toxClass.toLowerCase();
    switch (lower) {
      case 'most':
        return 'error';
      case 'less':
        return 'warning';
      case 'no':
        return 'success';
      case 'precaution':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatDate = (dateValue: any) => {
    if (dateValue === null || dateValue === undefined) return 'N/A';
    const dateStr = String(dateValue);
    if (dateStr.length < 8) return dateStr || 'N/A';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  };

  const MetaItem = ({
    icon,
    label,
    value,
    isLink = false,
    onClick,
  }: {
    icon: any;
    label: string;
    value: any;
    isLink?: boolean;
    onClick?: () => void;
  }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
      <Box sx={{ mr: 1.5, mt: 0.3, color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
        {isLink && value !== 'N/A' ? (
          <Typography
            variant="body2"
            component="a"
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              fontWeight: 600,
              color: '#1a237e',
              textDecoration: 'underline',
              cursor: 'pointer',
              display: 'block',
            }}
          >
            View Official Labeling
          </Typography>
        ) : (
          <Typography
            variant="body2"
            onClick={onClick}
            sx={{
              fontWeight: 500,
              color: onClick ? '#1a237e' : 'text.primary',
              cursor: onClick ? 'pointer' : 'default',
              textDecoration: onClick ? 'underline' : 'none',
            }}
          >
            {value || 'N/A'}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#f4f7f9',
        width: '100%',
        m: 0,
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <GlobalStyles
        styles={{
          html: { margin: 0, padding: 0, width: '100%', overflowX: 'hidden' },
          body: { margin: 0, padding: 0, width: '100%', overflowX: 'hidden', display: 'block' },
          '#root': {
            margin: '0 !important',
            padding: '0 !important',
            width: '100%',
            maxWidth: 'none !important',
            textAlign: 'left !important',
          },
          '.MuiPaper-root': { boxShadow: '0 2px 12px rgba(0,0,0,0.05) !important' },
        }}
      />

      {/* Main Header */}
      <header className="header-main" style={{ width: '100vw', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link href="/" style={{ 
            backgroundColor: 'white', 
            padding: '5px', 
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none'
          }}>
             <img src="/askfdalabel_icon.svg" alt="Logo" style={{ height: '24px' }} />
          </Link>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white', letterSpacing: '-0.025em' }}>
            DrugTox <span style={{ fontWeight: 300, opacity: 0.8 }}>Intelligence</span>
          </h1>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/" style={{ color: 'white', fontSize: '0.875rem', textDecoration: 'none', opacity: 0.9 }}>Suite Home</Link>
        </nav>
      </header>

      <Container maxWidth="lg" sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ textAlign: 'center', mb: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <Typography variant="h2" sx={{ fontWeight: 900, color: '#1a237e', mb: 1, letterSpacing: '-1.5px' }}>
            askDrugTox
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, opacity: 0.8, mb: 6 }}>
            Advanced Pharmacology Intelligence Dashboard
          </Typography>

          <Paper sx={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 800, p: 1, border: '1px solid #e0e0e0', mb: 4 }}>
            <Autocomplete
              fullWidth
              options={options}
              freeSolo
              inputValue={inputValue}
              onInputChange={(_e, v) => setInputValue(v)}
              onChange={(_e, v) => {
                const val = v || '';
                setQuery(val);
                if (val) {
                  setPage(0);
                  setActiveTab(1);
                  fetchDrugs(val, toxType, showHistorical, changedOnly, 0, rowsPerPage);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="standard"
                  placeholder="Search drug database..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setQuery(inputValue);
                      handleSearchSubmit();
                    }
                  }}
                  InputProps={{
                    ...params.InputProps,
                    disableUnderline: true,
                    startAdornment: (
                      <InputAdornment position="start" sx={{ ml: 2 }}>
                        <SearchIcon color="primary" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ml: 1, flex: 1 }}
                />
              )}
            />
            <Button variant="contained" onClick={() => handleSearchSubmit()} sx={{ borderRadius: '10px', px: 5, py: 1.5, fontWeight: 700, boxShadow: 'none' }}>
              Analyze
            </Button>
          </Paper>

          <Stack direction="column" alignItems="center" spacing={3}>
            <ToggleButtonGroup
              value={toxType}
              exclusive
              onChange={handleToxTypeChange}
              color="primary"
              sx={{ backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            >
              <ToggleButton value="DILI" sx={{ px: 6, fontWeight: 700 }}>
                LIVER
              </ToggleButton>
              <ToggleButton value="DICT" sx={{ px: 6, fontWeight: 700 }}>
                HEART
              </ToggleButton>
              <ToggleButton value="DIRI" sx={{ px: 6, fontWeight: 700 }}>
                KIDNEY
              </ToggleButton>
            </ToggleButtonGroup>

            <Stack direction="row" spacing={6} sx={{ mt: 1 }}>
              <FormControlLabel
                control={<Switch checked={showHistorical} onChange={handleHistoricalToggle} color="primary" />}
                label={<Typography variant="button" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem' }}>Archives</Typography>}
              />
              <FormControlLabel
                control={<Switch checked={changedOnly} onChange={handleChangedOnlyToggle} color="warning" />}
                label={<Typography variant="button" sx={{ fontWeight: 700, color: '#ed6c02', fontSize: '0.75rem' }}>Latest Changes</Typography>}
              />
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 5, width: '100%' }}>
          <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)} sx={{ '& .MuiTab-root': { fontWeight: 800, fontSize: '0.9rem', minWidth: 160 } }}>
            <Tab icon={<DashboardIcon />} iconPosition="start" label="ANALYTICS" />
            <Tab icon={<ListIcon />} iconPosition="start" label="EXPLORER" />
            <Tab icon={<GavelIcon />} iconPosition="start" label="DISCREPANCIES" />
          </Tabs>
        </Box>

        <Box sx={{ width: '100%' }}>
          {activeTab === 0 ? (
            <Box>
              <Grid container spacing={4}>
                {/* MUI v7 Grid: remove `item` */}
                <Grid xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', borderTop: '5px solid #1a237e' }}>
                    <CardContent sx={{ py: 4 }}>
                      <Typography variant="overline" sx={{ fontWeight: 800 }}>
                        Total Labels
                      </Typography>
                      <Typography variant="h2" sx={{ fontWeight: 900, color: '#1a237e' }}>
                        {stats?.distribution.reduce((a, c) => a + c.count, 0).toLocaleString()}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', borderTop: '5px solid #ed6c02' }}>
                    <CardContent sx={{ py: 4 }}>
                      <Typography variant="overline" sx={{ fontWeight: 800 }}>
                        Recent Updates
                      </Typography>
                      <Typography variant="h2" sx={{ fontWeight: 900, color: '#ed6c02' }}>
                        {stats?.total_changes}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12} md={4}>
                  <Card sx={{ textAlign: 'center', borderTop: '5px solid #2e7d32' }}>
                    <CardContent sx={{ py: 4 }}>
                      <Typography variant="overline" sx={{ fontWeight: 800 }}>
                        No Toxicity
                      </Typography>
                      <Typography variant="h2" sx={{ fontWeight: 900, color: '#2e7d32' }}>
                        {stats?.distribution.find((d) => d.Toxicity_Class === 'No')?.count || 0}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid xs={12}>
                  <Paper sx={{ p: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 900, mb: 4, color: '#1a237e' }}>
                      Agent Toxicity Distribution
                    </Typography>
                    <Box sx={{ width: '100%', height: 450 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats?.distribution}
                            innerRadius={100}
                            outerRadius={160}
                            paddingAngle={10}
                            dataKey="count"
                            nameKey="Toxicity_Class"
                            label={(p: any) => `${p.name} ${((p.percent ? p.percent * 100 : 0) as number).toFixed(1)}%`}
                          >
                            {stats?.distribution.map((e, i) => (
                              <Cell key={`cell-${i}`} fill={COLORS[e.Toxicity_Class] || '#757575'} stroke="none" />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          ) : activeTab === 1 ? (
            <Box>
              {hasSearched ? (
                <Paper sx={{ overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                  <TableContainer sx={{ maxHeight: '60vh' }}>
                    <Table stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 900, backgroundColor: '#f8f9fa', color: '#1a237e' }}>TRADE NAME</TableCell>
                          <TableCell sx={{ fontWeight: 900, backgroundColor: '#f8f9fa', color: '#1a237e' }}>COMPANY</TableCell>
                          <TableCell sx={{ fontWeight: 900, backgroundColor: '#f8f9fa', color: '#1a237e' }}>RELEASE</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 900, backgroundColor: '#f8f9fa', color: '#1a237e' }}>
                            {toxType} STATUS
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {drugs.map((drug) => (
                          <TableRow
                            key={drug.SETID}
                            hover
                            sx={{
                              cursor: 'pointer',
                              backgroundColor:
                                selectedSetid === drug.SETID ? '#e8eaf6' : drug.is_historical === 1 ? '#fafafa' : 'inherit',
                              borderLeft:
                                selectedSetid === drug.SETID
                                  ? '6px solid #1a237e'
                                  : drug.Changed === 'Yes'
                                    ? '6px solid #ed6c02'
                                    : '6px solid transparent',
                              opacity: drug.is_historical === 1 ? 0.7 : 1,
                            }}
                          >
                            <TableCell sx={{ py: 2.5 }} onClick={() => setSelectedSetid(drug.SETID)}>
                              <Stack direction="row" alignItems="center" spacing={1.5}>
                                <Typography variant="body2" sx={{ fontWeight: 800, color: '#1a237e' }}>
                                  {drug.Trade_Name}
                                </Typography>
                                {drug.is_historical === 1 && (
                                  <Chip label="ARCHIVED" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18, fontWeight: 800 }} />
                                )}
                                {drug.Changed === 'Yes' && drug.is_historical === 0 && <NewReleasesIcon sx={{ color: '#ed6c02', fontSize: 20 }} />}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                startIcon={<BusinessIcon sx={{ fontSize: 16 }} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCompany(drug.Author_Organization);
                                }}
                                sx={{ textTransform: 'none', fontWeight: 600, color: '#1a237e' }}
                              >
                                {drug.Author_Organization}
                              </Button>
                            </TableCell>
                            <TableCell sx={{ color: '#546e7a', fontSize: '0.85rem' }} onClick={() => setSelectedSetid(drug.SETID)}>
                              {formatDate(drug.SPL_Effective_Time)}
                            </TableCell>
                            <TableCell align="center" onClick={() => setSelectedSetid(drug.SETID)}>
                              <Chip
                                label={drug.Toxicity_Class}
                                color={getToxColor(drug.Toxicity_Class) as any}
                                variant="filled"
                                sx={{ minWidth: 100, fontWeight: 900, borderRadius: '8px' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <TablePagination
                    rowsPerPageOptions={[10, 20, 50]}
                    component="div"
                    count={total}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                  />
                </Paper>
              ) : (
                <Box textAlign="center" py={10}>
                  <Typography variant="body1" sx={{ color: '#546e7a', fontStyle: 'italic' }}>
                    Initiate a search to explore the pharmacological dataset.
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid xs={12} md={8}>
                  <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 3, border: '1px solid #e0e0e0' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1a237e', display: 'flex', alignItems: 'center' }}>
                      <FilterListIcon sx={{ mr: 1 }} /> FILTER BY SEVERITY GAP:
                    </Typography>
                    <ToggleButtonGroup value={severityFilter} exclusive onChange={(_e, v) => v && setSeverityFilter(v)} size="small" color="primary">
                      <ToggleButton value="ALL" sx={{ px: 3, fontWeight: 700 }}>
                        ALL ({discrepancies.length})
                      </ToggleButton>
                      <ToggleButton value="HIGH" sx={{ px: 3, fontWeight: 700, color: 'error.main' }}>
                        HIGH ({discrepancies.filter((d) => d.severity_gap >= 3).length})
                      </ToggleButton>
                      <ToggleButton value="MEDIUM" sx={{ px: 3, fontWeight: 700, color: 'warning.main' }}>
                        MEDIUM ({discrepancies.filter((d) => d.severity_gap === 2).length})
                      </ToggleButton>
                      <ToggleButton value="LOW" sx={{ px: 3, fontWeight: 700, color: 'info.main' }}>
                        LOW ({discrepancies.filter((d) => d.severity_gap === 1).length})
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Paper>
                </Grid>
                <Grid xs={12} md={4}>
                  <Alert
                    severity="warning"
                    icon={<GavelIcon />}
                    sx={{ height: '100%', display: 'flex', alignItems: 'center', borderRadius: '12px', fontWeight: 700 }}
                  >
                    {discrepancies.length} Controversial Agents Detected
                  </Alert>
                </Grid>
              </Grid>

              {discrepancyLoading ? (
                <Box display="flex" justifyContent="center" py={10}>
                  <CircularProgress />
                </Box>
              ) : (
                <Grid container spacing={3}>
                  {filteredDiscrepancies.map((item, idx) => (
                    <Grid xs={12} md={6} lg={4} key={idx}>
                      <Card
                        variant="outlined"
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          borderTop: `4px solid ${
                            item.severity_gap >= 3 ? '#c62828' : item.severity_gap === 2 ? '#ef6c00' : '#1565c0'
                          }`,
                        }}
                      >
                        <Box
                          sx={{
                            p: 2,
                            backgroundColor: '#f8f9fa',
                            borderBottom: '1px solid #eee',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 900, color: '#1a237e' }}>
                            {item.generic_name}
                          </Typography>
                          <Chip label={`Gap: ${item.severity_gap}`} size="small" color={item.severity_gap >= 3 ? 'error' : 'warning'} sx={{ fontWeight: 800 }} />
                        </Box>

                        <CardContent sx={{ flexGrow: 1 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 2 }}>
                            MARKET VARIANCE: {item.tox_range}
                          </Typography>

                          <Stack spacing={2}>
                            {item.classes_found.map((cls) => {
                              const classItems = item.details.filter((d) => d.Toxicity_Class === cls);
                              return (
                                <Box key={cls}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    <Chip label={cls} size="small" color={getToxColor(cls) as any} sx={{ height: 18, fontSize: '0.6rem', fontWeight: 800 }} />
                                    <Typography variant="caption" color="text.secondary">
                                      ({classItems.length})
                                    </Typography>
                                  </Box>
                                  <Stack spacing={0.5} sx={{ pl: 1.5 }}>
                                    {classItems.slice(0, 2).map((d, i) => (
                                      <Typography key={i} variant="body2" noWrap sx={{ fontSize: '0.7rem', fontWeight: 500, color: '#546e7a', maxWidth: 220 }}>
                                        • {d.Author_Organization}
                                      </Typography>
                                    ))}
                                    {classItems.length > 2 && (
                                      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', pl: 1 }}>
                                        ... and {classItems.length - 2} more
                                      </Typography>
                                    )}
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Stack>
                        </CardContent>

                        <Box sx={{ p: 1.5, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
                          <Button size="small" endIcon={<CompareArrowsIcon />} onClick={() => setSelectedSetid(item.details[0].SETID)}>
                            View market details
                          </Button>
                        </Box>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </Box>
      </Container>

      <Drawer
        anchor="right"
        open={!!selectedSetid}
        onClose={() => setSelectedSetid(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 800 }, borderLeft: '1px solid #e0e0e0' } }}
      >
        {detailLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : detail ? (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
            <Box sx={{ p: 4, backgroundColor: '#f8faff', borderBottom: '1px solid #e0e6f0' }}>
              <Box display="flex" justifyContent="space-between" mb={3}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#1a237e', mb: 0.5 }}>
                    {detail.Trade_Name}
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: '#546e7a', fontWeight: 600 }}>
                    {detail.Generic_Proper_Names}
                  </Typography>
                </Box>
                <IconButton onClick={() => setSelectedSetid(null)} sx={{ backgroundColor: '#fff' }}>
                  <CloseIcon />
                </IconButton>
              </Box>

              <Stack direction="row" spacing={1.5} mb={4}>
                <Chip label={`${detail.Tox_Type} : ${detail.Toxicity_Class}`} color={getToxColor(detail.Toxicity_Class) as any} sx={{ fontWeight: 900 }} />
                <Chip label={detail.Tox_Type} variant="outlined" icon={<ScienceIcon />} sx={{ fontWeight: 800 }} />
                {detail.Changed === 'Yes' && (
                  <Chip
                    label="CRITICAL UPDATE"
                    icon={<NewReleasesIcon />}
                    sx={{ backgroundColor: '#fff3e0', color: '#e65100', fontWeight: 900 }}
                    variant="outlined"
                  />
                )}
              </Stack>

              <Grid container spacing={3}>
                <Grid xs={12} sm={6}>
                  <MetaItem
                    icon={<BusinessIcon fontSize="small" />}
                    label="Marketing Sponsor"
                    value={detail.Author_Organization}
                    onClick={() => setSelectedCompany(detail.Author_Organization)}
                  />
                </Grid>
                <Grid xs={12} sm={6}>
                  <MetaItem icon={<CalendarTodayIcon fontSize="small" />} label="Label Approval Date" value={formatDate(detail.SPL_Effective_Time)} />
                </Grid>
                <Grid xs={12} sm={6}>
                  <MetaItem
                    icon={<AssignmentIcon fontSize="small" />}
                    label="DailyMed Source"
                    value={`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${detail.SETID}`}
                    isLink
                  />
                </Grid>
                <Grid xs={12} sm={6}>
                  <MetaItem icon={<InfoIcon fontSize="small" />} label="SPL SET-ID" value={detail.SETID} />
                </Grid>
                <Grid xs={12}>
                  <MetaItem icon={<NoteIcon fontSize="small" />} label="DrugTox history" value={detail.Update_Notes} />
                </Grid>
              </Grid>
            </Box>

            <Box sx={{ p: 4, overflowY: 'auto', flexGrow: 1 }}>
              <Grid container spacing={4}>
                <Grid xs={12} md={7}>
                  <Accordion defaultExpanded sx={{ border: '1px solid #e0e0e0', borderRadius: '12px !important', mb: 4, overflow: 'hidden' }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ backgroundColor: '#fafafa', borderBottom: '1px solid #e0e0e0' }}>
                      <Typography sx={{ fontWeight: 900, color: '#1a237e', display: 'flex', alignItems: 'center' }}>
                        <DescriptionIcon sx={{ mr: 1 }} /> CLINICAL SUMMARY
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 3 }}>
                      <Box className="markdown-content" sx={{ lineHeight: 1.9, '& h1, & h2, & h3': { color: '#1a237e', mt: 3 } }}>
                        <ReactMarkdown>{detail.AI_Summary}</ReactMarkdown>
                      </Box>
                    </AccordionDetails>
                  </Accordion>

                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1a237e', mb: 3, display: 'flex', alignItems: 'center' }}>
                    <CompareArrowsIcon sx={{ mr: 1 }} /> MARKET COMPARISON
                  </Typography>

                  {market.length > 0 ? (
                    <Stack spacing={2}>
                      {market.map((item) => (
                        <Paper
                          key={item.SETID}
                          variant="outlined"
                          sx={{
                            p: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: '#f8faff' },
                          }}
                          onClick={() => setSelectedSetid(item.SETID)}
                        >
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                              {item.Author_Organization}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.Trade_Name}
                            </Typography>
                          </Box>
                          <Chip label={item.Toxicity_Class} size="small" color={getToxColor(item.Toxicity_Class) as any} sx={{ fontWeight: 800 }} />
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      No other active labeling sources found.
                    </Typography>
                  )}
                </Grid>

                <Grid xs={12} md={5}>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1a237e', mb: 3, display: 'flex', alignItems: 'center' }}>
                    <HistoryIcon sx={{ mr: 1 }} /> TOXICITY HISTORY
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 3, color: '#546e7a', fontWeight: 700, fontStyle: 'italic' }}>
                    Tracing: {detail.Author_Organization}
                  </Typography>

                  <Box sx={{ pl: 2, borderLeft: '2px dashed #cfd8dc' }}>
                    {history.map((item) => (
                      <Box key={item.SETID} sx={{ mb: 2, position: 'relative' }}>
                        <Avatar
                          sx={{
                            width: 14,
                            height: 14,
                            bgcolor: item.is_historical === 0 ? '#1a237e' : '#b0bec5',
                            position: 'absolute',
                            left: -27,
                            top: 4,
                            border: '2px solid #fff',
                          }}
                        >
                          {' '}
                        </Avatar>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" sx={{ fontWeight: 900 }}>
                              {formatDate(item.SPL_Effective_Time)}
                            </Typography>
                            <Chip
                              label={item.Toxicity_Class}
                              size="small"
                              color={getToxColor(item.Toxicity_Class) as any}
                              variant={item.is_historical === 0 ? 'filled' : 'outlined'}
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }}
                            />
                          </Stack>
                          <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', color: '#546e7a', fontWeight: 600 }}>
                            {item.Trade_Name}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      <Dialog open={!!selectedCompany} onClose={() => setSelectedCompany(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px !important' } }}>
        <DialogTitle
          sx={{
            backgroundColor: '#f8faff',
            borderBottom: '1px solid #eee',
            p: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <BusinessIcon color="primary" sx={{ fontSize: 32 }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900, color: '#1a237e' }}>
                {selectedCompany}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#546e7a' }}>
                Manufacturer Portfolio Analysis
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={() => setSelectedCompany(null)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 4 }}>
          {companyLoading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : companyStats ? (
            <Grid container spacing={4}>
              <Grid xs={12} md={5}>
                <Card variant="outlined" sx={{ mb: 3 }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography variant="overline" sx={{ fontWeight: 800 }}>
                      Total Sponsored Drugs
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900, color: '#1a237e' }}>
                      {companyStats.total_drugs}
                    </Typography>
                  </CardContent>
                </Card>

                <Paper variant="outlined" sx={{ p: 2, height: 300 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 2, textAlign: 'center' }}>
                    Toxicity Profile ({toxType})
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={companyStats.distribution}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="Toxicity_Class"
                        label={(p: any) => `${(p.percent * 100).toFixed(0)}%`}
                      >
                        {companyStats.distribution.map((e, i) => (
                          <Cell key={`cell-${i}`} fill={COLORS[e.Toxicity_Class] || '#757575'} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid xs={12} md={7}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, mb: 2, color: '#1a237e' }}>
                  Sponsored Agents
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, backgroundColor: '#f8f9fa' }}>TRADE NAME</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 800, backgroundColor: '#f8f9fa' }}>
                          STATUS
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {companyPortfolio.map((drug) => (
                        <TableRow
                          key={drug.SETID}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedSetid(drug.SETID);
                            setSelectedCompany(null);
                          }}
                        >
                          <TableCell sx={{ fontWeight: 700, py: 1.5 }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              {drug.Trade_Name}
                              {drug.Changed === 'Yes' && <NewReleasesIcon sx={{ color: '#ed6c02', fontSize: 16 }} />}
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={drug.Toxicity_Class}
                              size="small"
                              color={getToxColor(drug.Toxicity_Class) as any}
                              sx={{ fontWeight: 800, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
