'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import Header from "../components/Header";
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

const TOX_ORDER: Record<string, number> = {
  'Most': 1,
  'Less': 2,
  'No': 3,
  'Precaution': 4,
  'Unknown': 5,
};

const API_BASE = '/api/drugtox';

export default function DrugToxPage() {
  const theme = useTheme();
  const { session, updateAiProvider, loading: userLoading } = useUser();
  const [activeTab, setActiveTab] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<'user' | 'nav' | 'more' | null>(null);
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const checkInternalStatus = async () => {
      try {
        const response = await fetch("/api/check-fdalabel", { method: 'POST' });
        const data = await response.json();
        setIsInternal(data.isInternal);
      } catch (error) {
        setIsInternal(false);
      }
    };
    checkInternalStatus();
  }, []);

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
  const [marketPage, setMarketPage] = useState(1);
  const [marketExpanded, setMarketExpanded] = useState(false);
  const [marketFilterText, setMarketFilterText] = useState('');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(true);

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [companyPortfolio, setCompanyPortfolio] = useState<DrugSummary[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  // Drawer Resizing State
  const [drawerWidth, setDrawerWidth] = useState(800);
  const isResizing = useRef(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 400 && newWidth < window.innerWidth * 0.9) {
      setDrawerWidth(newWidth);
    }
  }, []);

  // Discrepancy State
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>('ALL');

  const filteredMarket = useMemo(() => {
    return market.filter(m => {
      const matchesText = !marketFilterText || 
        (m.Trade_Name?.toLowerCase() || '').includes(marketFilterText.toLowerCase()) ||
        (m.Author_Organization?.toLowerCase() || '').includes(marketFilterText.toLowerCase());
      
      const matchesCategory = !marketCategoryFilter || m.Toxicity_Class === marketCategoryFilter;
      
      return matchesText && matchesCategory;
    });
  }, [market, marketFilterText, marketCategoryFilter]);

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
      setMarketPage(1);
      setMarketExpanded(false);
      setMarketFilterText('');
      setMarketCategoryFilter(null);
      setMetaExpanded(true);
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
      setCompanyFilter(null); // Reset filter when company changes
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

  const filteredCompanyPortfolio = useMemo(() => {
    let result = [...companyPortfolio];
    
    // Sorting by Tox Class then Trade Name
    result.sort((a, b) => {
      const orderA = TOX_ORDER[a.Toxicity_Class] || 99;
      const orderB = TOX_ORDER[b.Toxicity_Class] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.Trade_Name.localeCompare(b.Trade_Name);
    });

    if (companyFilter) {
      result = result.filter(d => d.Toxicity_Class === companyFilter);
    }
    
    return result;
  }, [companyPortfolio, companyFilter]);

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

      <Header />

      <Container maxWidth="lg" sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ textAlign: 'center', mb: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <Typography variant="h2" className="hero-title-animated" sx={{ fontWeight: 900, mb: 1, letterSpacing: '-1.5px' }}>
            askDrugTox
          </Typography>
          <Typography variant="h6" className="hero-subtitle-animated" color="text.secondary" sx={{ fontWeight: 400, opacity: 0.8, mb: 6 }}>
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
              clearIcon={<CloseIcon sx={{ fontSize: 20 }} />}
              sx={{ 
                '& .MuiAutocomplete-clearIndicator': {
                  color: '#64748b',
                  transition: 'all 0.2s ease',
                  backgroundColor: 'transparent !important',
                  '&:hover': { 
                    color: '#1e293b',
                    transform: 'rotate(90deg)'
                  }
                },
                // Ensure the clear button doesn't push the Analyze button
                '& .MuiAutocomplete-endAdornment': {
                  right: '15px !important'
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
                  sx={{ ml: 1, flex: 1, pr: 2 }}
                />
              )}
            />
            <Button 
              variant="contained" 
              onClick={() => handleSearchSubmit()} 
              sx={{ 
                borderRadius: '10px', 
                px: 5, 
                py: 1.5, 
                fontWeight: 700, 
                boxShadow: 'none',
                ml: 1 // Add specific margin to separate from the input area
              }}
            >
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
        variant="persistent"
        PaperProps={{ 
          sx: { 
            width: drawerWidth, 
            borderLeft: 'none',
            overflow: 'visible',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)'
          } 
        }}
      >
        {/* Resize Handle */}
        <Box
          onMouseDown={startResizing}
          sx={{
            width: '10px',
            cursor: 'ew-resize',
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(26, 35, 126, 0.1)',
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              height: '40px',
              width: '2px',
              backgroundColor: '#cfd8dc',
              borderRadius: '1px'
            }
          }}
        />

        {detailLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : detail ? (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', ml: '15px' }}>
            <Box sx={{ p: 4, pl: 5, backgroundColor: '#f8faff', borderBottom: '1px solid #e0e6f0', mb: 4 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={metaExpanded ? 3 : 0}>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: '#1a237e', mb: 0.5 }}>
                    {detail.Trade_Name}
                  </Typography>
                  {!metaExpanded && (
                    <Stack direction="row" spacing={1} alignItems="center" mt={1}>
                      <Chip 
                        label={`${detail.Tox_Type}: ${detail.Toxicity_Class}`} 
                        size="small"
                        color={getToxColor(detail.Toxicity_Class) as any} 
                        sx={{ fontWeight: 900, height: 24 }} 
                      />
                      <Typography variant="caption" sx={{ color: '#546e7a', fontWeight: 600 }}>
                        {detail.Generic_Proper_Names}
                      </Typography>
                    </Stack>
                  )}
                  {metaExpanded && (
                    <Typography variant="subtitle1" sx={{ color: '#546e7a', fontWeight: 600 }}>
                      {detail.Generic_Proper_Names}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  <IconButton 
                    size="small"
                    onClick={() => setMetaExpanded(!metaExpanded)}
                    sx={{ color: '#64748b' }}
                  >
                    {metaExpanded ? <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} /> : <ExpandMoreIcon />}
                  </IconButton>
                  <IconButton 
                    onClick={() => setSelectedSetid(null)} 
                    sx={{ 
                      color: '#64748b',
                      transition: 'all 0.2s ease',
                      backgroundColor: 'transparent !important',
                      '&:hover': { 
                        color: '#1e293b',
                        transform: 'rotate(90deg)'
                      },
                      '&:active': {
                        backgroundColor: 'transparent !important'
                      }
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </Stack>
              </Box>

              {metaExpanded && (
                <Box sx={{ animation: 'fadeIn 0.3s ease-in-out' }}>
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
                        label="Source"
                        value={`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${detail.SETID}`}
                        isLink
                      />
                    </Grid>
                    <Grid xs={12} sm={6}>
                      <MetaItem
                        icon={<DashboardIcon fontSize="small" />}
                        label="Analysis"
                        value="View in Dashboard"
                        onClick={() => window.open(`/dashboard/label/${detail.SETID}`, '_blank')}
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
              )}
            </Box>

            <Box sx={{ p: 4, pl: 5, overflowY: 'auto', flexGrow: 1 }}>
              <Grid container spacing={5}>
                {/* 1. Toxicity History (Horizontal) */}
                <Grid xs={12} sx={{ mt: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1a237e', mb: 2, display: 'flex', alignItems: 'center' }}>
                    <HistoryIcon sx={{ mr: 1 }} /> TOXICITY HISTORY
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#546e7a', fontWeight: 700, fontStyle: 'italic' }}>
                    Tracing: {detail.Author_Organization}
                  </Typography>

                  <Box 
                    sx={{ 
                      display: 'flex', 
                      flexDirection: 'row', 
                      overflowX: 'auto', 
                      pb: 2,
                      gap: 3,
                      '&::-webkit-scrollbar': { height: '6px' },
                      '&::-webkit-scrollbar-thumb': { backgroundColor: '#cfd8dc', borderRadius: '3px' },
                      position: 'relative'
                    }}
                  >
                    {/* Horizontal connector line */}
                    <Box sx={{ 
                      position: 'absolute', 
                      top: '11px', 
                      left: 0, 
                      right: 0, 
                      height: '2px', 
                      borderTop: '2px dashed #cfd8dc', 
                      zIndex: 0 
                    }} />

                    {history.map((item) => (
                      <Box 
                        key={item.SETID} 
                        sx={{ 
                          minWidth: '180px', 
                          position: 'relative', 
                          zIndex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start'
                        }}
                      >
                        <Avatar
                          sx={{
                            width: 22,
                            height: 22,
                            bgcolor: item.is_historical === 0 ? '#1a237e' : '#b0bec5',
                            border: '4px solid #fff',
                            boxShadow: '0 0 0 1px #cfd8dc',
                            mb: 1.5
                          }}
                        >
                          {item.is_historical === 0 ? 'L' : 'H'}
                        </Avatar>
                        <Box sx={{ backgroundColor: 'white', p: 1, borderRadius: '8px', border: '1px solid #f1f5f9', width: '100%' }}>
                          <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.primary', display: 'block' }}>
                            {formatDate(item.SPL_Effective_Time)}
                          </Typography>
                          <Chip
                            label={item.Toxicity_Class}
                            size="small"
                            color={getToxColor(item.Toxicity_Class) as any}
                            variant={item.is_historical === 0 ? 'filled' : 'outlined'}
                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 800, my: 0.5 }}
                          />
                          <Typography variant="body2" noWrap sx={{ fontSize: '0.7rem', color: '#546e7a', fontWeight: 600, maxWidth: '160px' }}>
                            {item.Trade_Name}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Grid>

                {/* 2. Market Comparison (Full Row) */}
                <Grid xs={12} sx={{ mt: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1a237e', mb: 2, display: 'flex', alignItems: 'center' }}>
                    <CompareArrowsIcon sx={{ mr: 1 }} /> MARKET COMPARISON
                  </Typography>

                  {market.length > 0 ? (
                    <Box>
                      {/* Market Statistics & Category Filters */}
                      <Paper variant="outlined" sx={{ p: 2, mb: 2, backgroundColor: '#fcfcfd', borderRadius: '12px' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>FILTER BY CATEGORY:</Typography>
                        <Stack direction="row" flexWrap="wrap" gap={1}>
                          <Chip 
                            label={`Total: ${market.length}`} 
                            onClick={() => { setMarketCategoryFilter(null); setMarketPage(1); }}
                            variant={marketCategoryFilter === null ? 'filled' : 'outlined'}
                            size="small" 
                            color={marketCategoryFilter === null ? 'primary' : 'default'}
                            sx={{ fontWeight: 800, fontSize: '0.7rem' }} 
                          />
                          {Object.keys(COLORS).map(cls => {
                            const count = market.filter(m => m.Toxicity_Class === cls).length;
                            if (count === 0) return null;
                            const isActive = marketCategoryFilter === cls;
                            return (
                              <Chip 
                                key={cls} 
                                label={`${cls}: ${count}`} 
                                size="small" 
                                onClick={() => { setMarketCategoryFilter(isActive ? null : cls); setMarketPage(1); }}
                                sx={{ 
                                  fontWeight: 800, 
                                  backgroundColor: isActive ? COLORS[cls] : 'transparent',
                                  borderColor: COLORS[cls],
                                  color: isActive ? 'white' : COLORS[cls],
                                  border: '1px solid',
                                  fontSize: '0.7rem',
                                  '&:hover': {
                                    backgroundColor: isActive ? COLORS[cls] : 'rgba(0,0,0,0.04)'
                                  }
                                }} 
                              />
                            );
                          })}
                        </Stack>
                      </Paper>

                      {/* Text Search Filter */}
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="Filter market by drug or company name..."
                        value={marketFilterText}
                        onChange={(e) => { setMarketFilterText(e.target.value); setMarketPage(1); }}
                        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <SearchIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        }}
                      />

                      {/* Expand/Collapse Toggle */}
                      <Button 
                        size="small" 
                        onClick={() => setMarketExpanded(!marketExpanded)}
                        endIcon={marketExpanded ? <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} /> : <ExpandMoreIcon />}
                        sx={{ mb: 1, fontWeight: 700, textTransform: 'none' }}
                      >
                        {marketExpanded ? 'Hide detailed list' : `Show ${filteredMarket.length} matching drugs`}
                      </Button>

                      {/* Collapsible Paginated List */}
                      {marketExpanded && (
                        <Box sx={{ animation: 'fadeIn 0.3s ease-in-out', ml: 3, borderLeft: '3px solid #f1f5f9', pl: 2, mt: 2 }}>
                          {filteredMarket.length > 0 ? (
                            <>
                              <Grid container spacing={2}>
                                {filteredMarket.slice((marketPage - 1) * 10, marketPage * 10).map((item) => (
                                  <Grid xs={12} sm={6} key={item.SETID}>
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        p: 1.5,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        '&:hover': { backgroundColor: '#f8faff', borderColor: '#1a237e' },
                                      }}
                                      onClick={() => setSelectedSetid(item.SETID)}
                                    >
                                      <Box sx={{ maxWidth: '70%' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.2 }}>
                                          {item.Trade_Name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                          {item.Author_Organization}
                                        </Typography>
                                      </Box>
                                      <Chip 
                                        label={item.Toxicity_Class} 
                                        size="small" 
                                        color={getToxColor(item.Toxicity_Class) as any} 
                                        sx={{ fontWeight: 800, fontSize: '0.65rem', height: 20 }} 
                                      />
                                    </Paper>
                                  </Grid>
                                ))}
                              </Grid>
                              
                              {filteredMarket.length > 10 && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                  <TablePagination
                                    component="div"
                                    count={filteredMarket.length}
                                    page={marketPage - 1}
                                    onPageChange={(_e, newPage) => setMarketPage(newPage + 1)}
                                    rowsPerPage={10}
                                    rowsPerPageOptions={[]}
                                    sx={{ border: 'none' }}
                                  />
                                </Box>
                              )}
                            </>
                          ) : (
                            <Typography variant="body2" sx={{ py: 4, textAlign: 'center', color: 'text.secondary', fontStyle: 'italic' }}>
                              No drugs match your filters.
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                      No other active labeling sources found.
                    </Typography>
                  )}
                </Grid>

                {/* 3. Clinical Summary (Full Row) */}
                <Grid xs={12} sx={{ mt: 2, mb: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: '#1a237e', mb: 2, display: 'flex', alignItems: 'center' }}>
                    <DescriptionIcon sx={{ mr: 1 }} /> CLINICAL SUMMARY
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 3, backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
                    <Box className="markdown-content" sx={{ lineHeight: 1.9, '& h1, & h2, & h3': { color: '#1a237e', mt: 3 } }}>
                      <ReactMarkdown>{detail.AI_Summary}</ReactMarkdown>
                    </Box>
                  </Paper>
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
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#546e7a' }}>
                  Manufacturer Portfolio Analysis
                </Typography>
                {companyStats && (
                  <Chip 
                    label={`${companyStats.total_drugs} Drugs`} 
                    size="small" 
                    color="primary" 
                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 800 }} 
                  />
                )}
              </Stack>
            </Box>
          </Box>
          <IconButton 
            onClick={() => setSelectedCompany(null)}
            sx={{ 
              color: '#64748b',
              transition: 'all 0.2s ease',
              backgroundColor: 'transparent !important',
              '&:hover': { 
                color: '#1e293b',
                transform: 'rotate(90deg)'
              },
              '&:active': {
                backgroundColor: 'transparent !important'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 4, backgroundColor: '#fcfcfd' }}>
          {companyLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={10}>
              <CircularProgress size={40} thickness={4} />
            </Box>
          ) : companyStats ? (
            <Grid container spacing={3}>
              {/* Left Column: Chart Card */}
              <Grid item xs={12} md={5}>
                <Paper 
                  elevation={0} 
                  variant="outlined" 
                  sx={{ 
                    p: 3, 
                    height: '100%', 
                    minHeight: 400, 
                    display: 'flex', 
                    flexDirection: 'column',
                    borderRadius: 2,
                    borderColor: '#e0e4ec'
                  }}
                >
                  <Typography 
                    variant="subtitle2" 
                    sx={{ fontWeight: 800, mb: 3, textAlign: 'center', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    Toxicity Distribution ({toxType})
                  </Typography>
                  
                  <Box sx={{ flexGrow: 1, width: '100%', minHeight: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={companyStats.distribution}
                          innerRadius={70}
                          outerRadius={100}
                          paddingAngle={8}
                          dataKey="count"
                          nameKey="Toxicity_Class"
                          label={(p: any) => `${((p.percent || 0) * 100).toFixed(0)}%`}
                        >
                          {companyStats.distribution.map((e, i) => (
                            <Cell 
                              key={`cell-${i}`} 
                              fill={COLORS[e.Toxicity_Class] || '#9ca3af'} 
                              stroke="none"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend 
                          verticalAlign="bottom" 
                          align="center"
                          iconType="circle"
                          wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>

              {/* Right Column: Table and Filter */}
              <Grid item xs={12} md={7}>
                <Box sx={{ mb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#1a237e' }}>
                    Sponsored Agents
                  </Typography>
                  
                  <ToggleButtonGroup
                    value={companyFilter || ''}
                    exclusive
                    onChange={(_e, v) => setCompanyFilter(v || null)}
                    size="small"
                    sx={{ 
                      backgroundColor: '#fff',
                      '& .MuiToggleButton-root': { 
                        px: 1.5, 
                        py: 0.5, 
                        fontSize: '0.7rem', 
                        fontWeight: 700,
                        border: '1px solid #e0e4ec',
                        '&.Mui-selected': {
                          backgroundColor: '#1a237e',
                          color: '#fff',
                          '&:hover': { backgroundColor: '#283593' }
                        }
                      } 
                    }}
                  >
                    <ToggleButton value="">ALL</ToggleButton>
                    {companyStats.distribution
                      .filter(d => d.count > 0)
                      .map(d => (
                        <ToggleButton key={d.Toxicity_Class} value={d.Toxicity_Class}>
                          {d.Toxicity_Class}
                        </ToggleButton>
                      ))}
                  </ToggleButtonGroup>
                </Box>

                <TableContainer 
                  component={Paper} 
                  variant="outlined" 
                  sx={{ 
                    maxHeight: 450, 
                    borderRadius: 2,
                    borderColor: '#e0e4ec',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { backgroundColor: '#d1d5db', borderRadius: '10px' }
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800, backgroundColor: '#f8f9fa', color: '#4b5563', py: 1.5 }}>TRADE NAME</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 800, backgroundColor: '#f8f9fa', color: '#4b5563' }}>STATUS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredCompanyPortfolio.map((drug) => (
                        <TableRow
                          key={drug.SETID}
                          hover
                          sx={{ cursor: 'pointer', '&:last-child td, &:last-child th': { border: 0 } }}
                          onClick={() => {
                            setSelectedSetid(drug.SETID);
                            setSelectedCompany(null);
                          }}
                        >
                          <TableCell sx={{ fontWeight: 600, py: 1.5, color: '#1f2937' }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              {drug.Trade_Name}
                              {drug.Changed === 'Yes' && (
                                <NewReleasesIcon sx={{ color: '#ed6c02', fontSize: 16 }} />
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={drug.Toxicity_Class}
                              size="small"
                              color={getToxColor(drug.Toxicity_Class) as any}
                              sx={{ 
                                fontWeight: 800, 
                                fontSize: '0.65rem', 
                                width: 70,
                                borderRadius: '4px' 
                              }}
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

