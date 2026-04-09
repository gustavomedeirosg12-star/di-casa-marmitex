import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, MapPin, Clock, Utensils, ChefHat, ArrowLeft, CheckCircle2, Lock, LayoutDashboard, ListOrdered, LogOut, Edit, PlusCircle, DollarSign, TrendingUp, Package, Users } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './firebase';

// --- Types ---
type Category = 'Pratos Feitos' | 'Marmitex' | 'Espetinhos' | 'Jantinhas';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type OrderType = 'delivery' | 'pickup';
type PaymentMethod = 'pix' | 'credit' | 'debit' | 'cash';
type OrderStatus = 'Novos' | 'Preparando' | 'Saiu para Entrega' | 'Finalizados';

interface Order {
  id: string;
  customerName: string;
  orderType: OrderType;
  address: string;
  paymentMethod: PaymentMethod;
  items: { productId: string; name: string; price: number; quantity: number }[];
  total: number;
  status: OrderStatus;
  createdAt: any;
}

// --- Initial Mock Data ---
const INITIAL_MENU_ITEMS: Product[] = [
  { id: 'pf-1', name: 'Prato Feito Tradicional', description: 'Arroz, feijão, bife acebolado, batata frita e salada.', price: 17.00, category: 'Pratos Feitos' },
  { id: 'pf-2', name: 'Prato Feito de Frango', description: 'Arroz, feijão, filé de frango grelhado, purê e salada.', price: 17.00, category: 'Pratos Feitos' },
  { id: 'mar-p', name: 'Marmitex P', description: 'Ideal para 1 pessoa. Escolha 1 carne e acompanhamentos.', price: 15.00, category: 'Marmitex' },
  { id: 'mar-m', name: 'Marmitex M', description: 'Tamanho médio. Escolha até 2 carnes e acompanhamentos.', price: 20.00, category: 'Marmitex' },
  { id: 'mar-g', name: 'Marmitex G', description: 'Bem servida. Escolha até 3 carnes e acompanhamentos.', price: 25.00, category: 'Marmitex' },
  { id: 'esp-1', name: 'Espetinho de Carne', description: 'Espeto de alcatra macia.', price: 5.00, category: 'Espetinhos' },
  { id: 'esp-2', name: 'Espetinho de Frango', description: 'Espeto de peito de frango com bacon.', price: 5.00, category: 'Espetinhos' },
  { id: 'esp-3', name: 'Espetinho de Linguiça', description: 'Linguiça toscana assada na brasa.', price: 5.00, category: 'Espetinhos' },
  { id: 'jan-1', name: 'Jantinha Simples', description: '1 Espeto à escolha, arroz, feijão tropeiro, mandioca e vinagrete.', price: 22.00, category: 'Jantinhas' },
  { id: 'jan-2', name: 'Jantinha Completa', description: '2 Espetos à escolha, arroz, feijão tropeiro, mandioca e vinagrete.', price: 28.00, category: 'Jantinhas' },
];

// --- Helper Functions ---
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
};

const getPaymentMethodLabel = (method: PaymentMethod) => {
  switch (method) {
    case 'pix': return 'Pix';
    case 'credit': return 'Cartão de Crédito';
    case 'debit': return 'Cartão de Débito';
    case 'cash': return 'Dinheiro';
  }
};

// --- Login Component ---
function LoginScreen({ onBack }: { onBack: () => void }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Erro ao fazer login:", error);
      alert(`Erro ao fazer login: ${error.message || 'Erro desconhecido'}\n\nDica: Se estiver usando o Safari ou aba anônima, tente abrir o app em uma nova guia, pois o navegador pode estar bloqueando cookies de terceiros no iframe.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 font-sans text-stone-800">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-stone-100 text-center">
        <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-2">Acesso Restrito</h2>
        <p className="text-stone-500 mb-8">Faça login para acessar o painel de gestão do Di Casa Marmitex.</p>
        
        <button 
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mb-4"
        >
          {isLoading ? 'Aguarde...' : 'Entrar com Google'}
        </button>
        
        <button 
          onClick={onBack}
          className="text-stone-500 hover:text-stone-700 text-sm font-medium transition-colors"
        >
          Voltar para o Cardápio
        </button>
      </div>
    </div>
  );
}

// --- Admin Panel Component ---
interface AdminPanelProps {
  onExit: () => void;
  onLogout: () => void;
  menuItems: Product[];
}

function AdminPanel({ onExit, onLogout, menuItems }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'customers'>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);

  // Menu Manager State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData: Order[] = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() } as Order);
      });
      setOrders(ordersData);
    });
    return () => unsubscribe();
  }, []);

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      alert("Erro ao atualizar o pedido.");
    }
  };

  // Metrics
  const revenue = orders.filter(o => o.status === 'Finalizados').reduce((acc, o) => acc + o.total, 0);
  const activeOrders = orders.filter(o => o.status !== 'Finalizados').length;
  const totalOrders = orders.length;

  // CRM Data Calculation
  const customersData = useMemo(() => {
    const map = new Map<string, { name: string; totalSpent: number; orderCount: number; lastOrder: any; address: string }>();

    orders.forEach(order => {
      const key = order.customerName.trim().toLowerCase();
      if (!key) return;

      const existing = map.get(key);
      if (existing) {
        existing.orderCount += 1;
        if (order.status === 'Finalizados') {
          existing.totalSpent += order.total;
        }
        // Assuming createdAt is a Firestore timestamp, we can compare them
        if (order.createdAt && existing.lastOrder && order.createdAt.toMillis() > existing.lastOrder.toMillis()) {
          existing.lastOrder = order.createdAt;
          if (order.address) existing.address = order.address;
        }
      } else {
        map.set(key, {
          name: order.customerName,
          totalSpent: order.status === 'Finalizados' ? order.total : 0,
          orderCount: 1,
          lastOrder: order.createdAt,
          address: order.address || ''
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders]);

  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: parseFloat(formData.get('price') as string),
      category: formData.get('category') as Category,
    };

    try {
      if (editingProduct) {
        // Usamos setDoc com merge: true caso o produto seja do fallback e ainda não exista no banco
        await setDoc(doc(db, 'products', editingProduct.id), productData, { merge: true });
      } else {
        await addDoc(collection(db, 'products'), productData);
      }
      setEditingProduct(null);
      setIsAddingProduct(false);
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      alert("Erro ao salvar produto.");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if(confirm('Tem certeza que deseja remover este item do cardápio?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (error) {
        console.error("Erro ao deletar produto:", error);
        alert("Erro ao deletar produto.");
      }
    }
  };

  const handleRestoreMenu = async () => {
    if(confirm('Isso vai adicionar os itens padrão ao banco de dados. Deseja continuar?')) {
      try {
        for (const item of INITIAL_MENU_ITEMS) {
          const { id, ...data } = item;
          await setDoc(doc(db, 'products', id), data);
        }
        alert('Cardápio restaurado com sucesso!');
      } catch (error) {
        console.error("Erro ao restaurar:", error);
        alert("Erro ao restaurar o cardápio.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex font-sans text-stone-800">
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 text-stone-300 flex flex-col shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-stone-800">
          <div className="bg-orange-500 p-2 rounded-lg">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Di Casa SaaS</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-orange-500 text-white shadow-md' : 'hover:bg-stone-800 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'orders' ? 'bg-orange-500 text-white shadow-md' : 'hover:bg-stone-800 hover:text-white'}`}
          >
            <ListOrdered className="w-5 h-5" /> Pedidos
            {activeOrders > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{activeOrders}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'menu' ? 'bg-orange-500 text-white shadow-md' : 'hover:bg-stone-800 hover:text-white'}`}
          >
            <Utensils className="w-5 h-5" /> Cardápio
          </button>
          <button 
            onClick={() => setActiveTab('customers')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'customers' ? 'bg-orange-500 text-white shadow-md' : 'hover:bg-stone-800 hover:text-white'}`}
          >
            <Users className="w-5 h-5" /> Clientes
          </button>
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-2">
          <button 
            onClick={onExit}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-stone-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" /> Voltar ao Site
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors text-stone-400"
          >
            <LogOut className="w-5 h-5" /> Sair da Conta
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white px-8 py-5 border-b border-stone-200 flex justify-between items-center shadow-sm">
          <h2 className="text-2xl font-bold text-stone-800 capitalize">
            {activeTab === 'orders' ? 'Gestão de Pedidos' : activeTab === 'customers' ? 'CRM & Clientes' : activeTab}
          </h2>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold border border-orange-200">
              AD
            </div>
            <div className="text-sm">
              <p className="font-bold text-stone-800 leading-none">Admin</p>
              <p className="text-stone-500">Di Casa Marmitex</p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-stone-50/50">
          
          {/* --- DASHBOARD TAB --- */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
                  <div className="p-4 bg-green-100 text-green-600 rounded-xl"><DollarSign className="w-8 h-8" /></div>
                  <div>
                    <p className="text-stone-500 font-medium">Faturamento (Finalizados)</p>
                    <h3 className="text-3xl font-bold text-stone-800">{formatPrice(revenue)}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
                  <div className="p-4 bg-orange-100 text-orange-600 rounded-xl"><TrendingUp className="w-8 h-8" /></div>
                  <div>
                    <p className="text-stone-500 font-medium">Pedidos em Andamento</p>
                    <h3 className="text-3xl font-bold text-stone-800">{activeOrders}</h3>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-4">
                  <div className="p-4 bg-blue-100 text-blue-600 rounded-xl"><Package className="w-8 h-8" /></div>
                  <div>
                    <p className="text-stone-500 font-medium">Total de Pedidos</p>
                    <h3 className="text-3xl font-bold text-stone-800">{totalOrders}</h3>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
                <h3 className="text-lg font-bold text-stone-800 mb-4">Últimos Pedidos</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-stone-500 border-b border-stone-100">
                        <th className="pb-3 font-medium">Cliente</th>
                        <th className="pb-3 font-medium">Tipo</th>
                        <th className="pb-3 font-medium">Valor</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.slice(0, 5).map(order => (
                        <tr key={order.id} className="border-b border-stone-50 last:border-0">
                          <td className="py-4 font-medium text-stone-800">{order.customerName}</td>
                          <td className="py-4 text-stone-600">{order.orderType === 'delivery' ? 'Entrega' : 'Retirada'}</td>
                          <td className="py-4 font-medium text-stone-800">{formatPrice(order.total)}</td>
                          <td className="py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              order.status === 'Novos' ? 'bg-blue-100 text-blue-700' :
                              order.status === 'Preparando' ? 'bg-yellow-100 text-yellow-700' :
                              order.status === 'Saiu para Entrega' ? 'bg-purple-100 text-purple-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr><td colSpan={4} className="py-8 text-center text-stone-400">Nenhum pedido registrado ainda.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- ORDERS (KANBAN) TAB --- */}
          {activeTab === 'orders' && (
            <div className="flex gap-6 h-full overflow-x-auto pb-4 animate-in fade-in duration-500">
              {[
                { title: 'Novos', status: 'Novos' as OrderStatus, color: 'blue' },
                { title: 'Preparando', status: 'Preparando' as OrderStatus, color: 'yellow' },
                { title: 'Saiu para Entrega', status: 'Saiu para Entrega' as OrderStatus, color: 'purple' },
                { title: 'Finalizados', status: 'Finalizados' as OrderStatus, color: 'green' },
              ].map((col) => {
                const colOrders = orders.filter(o => o.status === col.status);
                return (
                  <div key={col.status} className="w-80 flex-shrink-0 flex flex-col bg-stone-200/50 rounded-2xl border border-stone-200 h-full">
                    <div className="p-4 flex justify-between items-center">
                      <h3 className="font-bold text-stone-800">{col.title}</h3>
                      <span className="bg-white text-stone-600 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">
                        {colOrders.length}
                      </span>
                    </div>
                    
                    <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3">
                      {colOrders.map(order => (
                        <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-stone-900">{order.customerName}</h4>
                            <span className="text-[10px] uppercase tracking-wider font-bold bg-stone-100 text-stone-500 px-2 py-1 rounded">
                              {order.orderType === 'delivery' ? 'Entrega' : 'Retirada'}
                            </span>
                          </div>
                          
                          <div className="text-sm text-stone-600 mb-3">
                            <ul className="space-y-1 mb-2">
                              {order.items.map((item, idx) => (
                                <li key={idx} className="flex justify-between">
                                  <span>{item.quantity}x {item.name}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="font-bold text-stone-800 pt-2 border-t border-stone-100 flex justify-between">
                              <span>Total:</span>
                              <span>{formatPrice(order.total)}</span>
                            </div>
                            {order.orderType === 'delivery' && (
                              <div className="mt-2 p-2 bg-stone-50 rounded text-xs text-stone-500">
                                <MapPin className="w-3 h-3 inline mr-1" /> {order.address}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {col.status === 'Novos' && (
                              <button onClick={() => updateStatus(order.id, 'Preparando')} className="flex-1 bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold py-2 rounded-lg transition-colors">
                                Preparar
                              </button>
                            )}
                            {col.status === 'Preparando' && order.orderType === 'delivery' && (
                              <button onClick={() => updateStatus(order.id, 'Saiu para Entrega')} className="flex-1 bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold py-2 rounded-lg transition-colors">
                                Despachar
                              </button>
                            )}
                            {col.status === 'Preparando' && order.orderType === 'pickup' && (
                              <button onClick={() => updateStatus(order.id, 'Finalizados')} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-lg transition-colors">
                                Entregue
                              </button>
                            )}
                            {col.status === 'Saiu para Entrega' && (
                              <button onClick={() => updateStatus(order.id, 'Finalizados')} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 rounded-lg transition-colors">
                                Concluir
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* --- MENU MANAGER TAB --- */}
          {activeTab === 'menu' && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-stone-800">Gerenciar Cardápio</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={handleRestoreMenu}
                    className="bg-stone-200 hover:bg-stone-300 text-stone-700 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                  >
                    Restaurar Padrão
                  </button>
                  <button 
                    onClick={() => { setEditingProduct(null); setIsAddingProduct(true); }}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                  >
                    <PlusCircle className="w-5 h-5" /> Novo Item
                  </button>
                </div>
              </div>

              {(isAddingProduct || editingProduct) ? (
                <div className="bg-stone-50 p-6 rounded-xl border border-stone-200 mb-6">
                  <h4 className="font-bold text-stone-800 mb-4">{editingProduct ? 'Editar Item' : 'Novo Item'}</h4>
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Nome do Prato</label>
                        <input name="name" defaultValue={editingProduct?.name} required className="w-full p-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Preço (R$)</label>
                        <input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required className="w-full p-2 border rounded-lg" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Categoria</label>
                        <select name="category" defaultValue={editingProduct?.category || 'Pratos Feitos'} className="w-full p-2 border rounded-lg bg-white">
                          <option value="Pratos Feitos">Pratos Feitos</option>
                          <option value="Marmitex">Marmitex</option>
                          <option value="Espetinhos">Espetinhos</option>
                          <option value="Jantinhas">Jantinhas</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-stone-700 mb-1">Descrição</label>
                        <textarea name="description" defaultValue={editingProduct?.description} required rows={2} className="w-full p-2 border rounded-lg resize-none" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => { setIsAddingProduct(false); setEditingProduct(null); }} className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg font-medium transition-colors">Cancelar</button>
                      <button type="submit" className="px-4 py-2 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors">Salvar Item</button>
                    </div>
                  </form>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-stone-500 border-b border-stone-100">
                      <th className="pb-3 font-medium">Nome</th>
                      <th className="pb-3 font-medium">Categoria</th>
                      <th className="pb-3 font-medium">Preço</th>
                      <th className="pb-3 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menuItems.map(item => (
                      <tr key={item.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors">
                        <td className="py-4">
                          <p className="font-medium text-stone-800">{item.name}</p>
                          <p className="text-xs text-stone-500 truncate max-w-xs">{item.description}</p>
                        </td>
                        <td className="py-4 text-stone-600">
                          <span className="bg-stone-100 px-2 py-1 rounded text-xs">{item.category}</span>
                        </td>
                        <td className="py-4 font-medium text-stone-800">{formatPrice(item.price)}</td>
                        <td className="py-4 text-right">
                          <button onClick={() => setEditingProduct(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors mr-1">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteProduct(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- CUSTOMERS (CRM) TAB --- */}
          {activeTab === 'customers' && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-stone-800">Histórico de Clientes</h3>
                  <p className="text-sm text-stone-500">Ranking baseado no valor total gasto em pedidos finalizados.</p>
                </div>
                <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {customersData.length} Clientes
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-stone-500 border-b border-stone-100">
                      <th className="pb-3 font-medium">Cliente</th>
                      <th className="pb-3 font-medium">Último Endereço</th>
                      <th className="pb-3 font-medium text-center">Total de Pedidos</th>
                      <th className="pb-3 font-medium text-right">Valor Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersData.map((customer, idx) => (
                      <tr key={idx} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors">
                        <td className="py-4">
                          <p className="font-bold text-stone-800 flex items-center gap-2">
                            {idx < 3 && <span className="text-orange-500">★</span>}
                            {customer.name}
                          </p>
                          <p className="text-xs text-stone-400">
                            Último pedido: {customer.lastOrder ? new Date(customer.lastOrder.toDate()).toLocaleDateString('pt-BR') : 'N/A'}
                          </p>
                        </td>
                        <td className="py-4 text-stone-600 text-sm max-w-xs truncate">
                          {customer.address || <span className="text-stone-400 italic">Retirada no local</span>}
                        </td>
                        <td className="py-4 text-center font-medium text-stone-800">
                          <span className="bg-stone-100 px-3 py-1 rounded-full">{customer.orderCount}</span>
                        </td>
                        <td className="py-4 text-right font-bold text-green-600">
                          {formatPrice(customer.totalSpent)}
                        </td>
                      </tr>
                    ))}
                    {customersData.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-stone-400">
                          Nenhum cliente registrado ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// --- Order Tracker Component ---
function OrderTracker({ orderId, onClear }: { orderId: string, onClear: () => void }) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'orders', orderId), (docSnap) => {
      if (docSnap.exists()) {
        setOrder({ id: docSnap.id, ...docSnap.data() } as Order);
      } else {
        setOrder(null);
      }
    });
    return () => unsubscribe();
  }, [orderId]);

  if (!order) return <div className="p-8 text-center text-stone-500">Carregando status do pedido...</div>;

  const statusColors = {
    'Novos': 'bg-blue-100 text-blue-800 border-blue-200',
    'Preparando': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Saiu para Entrega': 'bg-purple-100 text-purple-800 border-purple-200',
    'Finalizados': 'bg-green-100 text-green-800 border-green-200',
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-2xl shadow-sm border border-stone-100 mt-8 animate-in fade-in slide-in-from-bottom-4">
      <h2 className="text-xl font-bold text-stone-800 mb-4">Status do seu Pedido</h2>
      <div className="mb-6">
        <p className="text-sm text-stone-500 mb-2">Pedido #{order.id.slice(-6).toUpperCase()}</p>
        <div className={`inline-block px-4 py-2 rounded-full font-bold border ${statusColors[order.status]}`}>
          {order.status}
        </div>
      </div>
      
      <div className="space-y-3 border-t border-stone-100 pt-4">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-stone-700">{item.quantity}x {item.name}</span>
            <span className="text-stone-500">{formatPrice(item.price * item.quantity)}</span>
          </div>
        ))}
        {order.orderType === 'delivery' && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>Taxa de Entrega</span>
            <span>R$ 12,00</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-stone-800 pt-2 border-t border-stone-100">
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>

      <button onClick={onClear} className="w-full mt-8 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded-xl font-bold transition-colors">
        Fazer novo pedido
      </button>
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  const [currentView, setCurrentView] = useState<'customer' | 'admin'>('customer');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // Lifted Menu State (So Admin can edit and Customer can see)
  const [menuItems, setMenuItems] = useState<Product[]>([]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });

    const q = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // Se o banco estiver vazio, mostra os itens padrão visualmente
        setMenuItems(INITIAL_MENU_ITEMS);
      } else {
        const productsData: Product[] = [];
        snapshot.forEach(docSnap => {
          productsData.push({ id: docSnap.id, ...docSnap.data() } as Product);
        });
        setMenuItems(productsData);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProducts();
    };
  }, []);

  // --- State ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'checkout'>('cart');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Checkout Form State
  const [customerName, setCustomerName] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(localStorage.getItem('lastOrderId'));

  // Store Hours Logic
  const checkStoreOpen = () => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    const openTime = 7 * 60 + 30; // 7:30 = 450
    const closeTime = 10 * 60 + 30; // 10:30 = 630

    if (day === 0) return false; // Sunday closed
    if (timeInMinutes >= openTime && timeInMinutes <= closeTime) return true;
    return false;
  };

  const [isOpen, setIsOpen] = useState(checkStoreOpen());

  useEffect(() => {
    const interval = setInterval(() => setIsOpen(checkStoreOpen()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentView('customer');
  };

  if (currentView === 'admin') {
    if (isAuthLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500">Carregando...</div>;
    }
    if (!user) {
      return <LoginScreen onBack={() => setCurrentView('customer')} />;
    }
    return <AdminPanel onExit={() => setCurrentView('customer')} onLogout={handleLogout} menuItems={menuItems} />;
  }

  // --- Cart Logic ---
  const addToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          const newQuantity = item.quantity + delta;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
        }
        return item;
      });
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
    if (cart.length === 1) {
      setCheckoutStep('cart'); // Go back if cart becomes empty
    }
  };

  const openCart = () => {
    setCheckoutStep('cart');
    setIsCartOpen(true);
  };

  const cartTotal = cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0);

  const handleFinalizeOrder = async () => {
    if (!customerName.trim()) {
      alert('Por favor, informe seu nome.');
      return;
    }
    if (orderType === 'delivery' && !address.trim()) {
      alert('Por favor, informe o endereço de entrega.');
      return;
    }

    setIsSubmitting(true);

    try {
      const deliveryFee = orderType === 'delivery' ? 12 : 0;
      const finalTotal = cartTotal + deliveryFee;

      // 1. Save to Firestore
      const orderData = {
        customerName: customerName.trim(),
        orderType,
        address: orderType === 'delivery' ? address.trim() : '',
        paymentMethod,
        items: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity
        })),
        total: finalTotal,
        status: 'Novos',
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      
      // Save order ID for tracking
      setTrackingOrderId(docRef.id);
      localStorage.setItem('lastOrderId', docRef.id);

      // 2. Format WhatsApp Message
      let message = `*NOVO PEDIDO - DI CASA MARMITEX* 🍛\n\n`;
      message += `*Cliente:* ${customerName.trim()}\n`;
      message += `*Tipo:* ${orderType === 'delivery' ? 'Entrega 🛵' : 'Retirar no Local 🚶'}\n`;
      if (orderType === 'delivery') {
        message += `*Endereço:* ${address.trim()}\n`;
      }
      message += `*Pagamento:* ${getPaymentMethodLabel(paymentMethod)}\n\n`;
      
      message += `*Pedido:*\n`;
      cart.forEach(item => {
        message += `${item.quantity}x ${item.product.name} (${formatPrice(item.product.price * item.quantity)})\n`;
      });
      
      if (orderType === 'delivery') {
        message += `\n*Taxa de Entrega:* R$ 12,00`;
      }
      message += `\n*Total do Pedido:* ${formatPrice(finalTotal)}`;

      // 3. Open WhatsApp
      const whatsappNumber = '5534998653707'; // The number provided in the prompt
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      
      // Reset cart and close
      setCart([]);
      setIsCartOpen(false);
      setCheckoutStep('cart');
      setCustomerName('');
      setAddress('');
      
      window.open(whatsappUrl, '_blank');

    } catch (error) {
      console.error("Erro ao salvar pedido:", error);
      alert("Ocorreu um erro ao processar seu pedido. Por favor, tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Group Menu by Category ---
  const categories: Category[] = ['Pratos Feitos', 'Marmitex', 'Espetinhos', 'Jantinhas'];

  return (
    <div className="min-h-screen bg-orange-50 font-sans text-stone-800 pb-24 flex flex-col">
      {/* Header */}
      <header className="bg-red-700 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ChefHat className="w-8 h-8 text-orange-200" />
            <h1 className="text-2xl font-bold tracking-tight">Di Casa Marmitex</h1>
          </div>
          <button 
            onClick={openCart}
            className="relative p-2 bg-red-800 rounded-full hover:bg-red-900 transition-colors"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white shadow-sm mb-6">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-red-800">Comida caseira delivery ✨</h2>
                {isOpen ? (
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Aberto
                  </span>
                ) : (
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span> Fechado
                  </span>
                )}
              </div>
              <p className="text-stone-600 mb-3">Servimos almoço todos os dias com o melhor tempero da região.</p>
              <div className="text-sm text-stone-500 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-stone-400" />
                  <span>Segunda a Sábado: 07:30 às 10:30 (Domingo Fechado)</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-stone-400" />
                  <span>R. do Adolescente, 51 - Laranjeiras, Uberlândia - MG, 38410-302</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Menu List or Order Tracker */}
      <main className="max-w-4xl mx-auto px-4 flex-1 w-full">
        {trackingOrderId ? (
          <OrderTracker 
            orderId={trackingOrderId} 
            onClear={() => {
              setTrackingOrderId(null);
              localStorage.removeItem('lastOrderId');
            }} 
          />
        ) : categories.map((category) => {
            const items = menuItems.filter((item) => item.category === category);
            if (items.length === 0) return null;

            return (
              <div key={category} className="mb-8">
                <h3 className="text-2xl font-bold text-stone-800 mb-4 border-b-2 border-red-200 pb-2">
                  {category}
                </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-stone-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-lg text-red-900">{item.name}</h4>
                        <span className="font-bold text-orange-600 whitespace-nowrap ml-2">
                          {formatPrice(item.price)}
                        </span>
                      </div>
                      <p className="text-stone-500 text-sm mb-4">{item.description}</p>
                    </div>
                    <button
                      onClick={() => addToCart(item)}
                      className="w-full bg-orange-100 text-orange-700 font-medium py-2 rounded-lg hover:bg-orange-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </main>

      {/* Footer with hidden Admin Link */}
      <footer className="mt-12 py-6 text-center text-stone-400 text-sm">
        <p>© {new Date().getFullYear()} Di Casa Marmitex.</p>
        <button 
          onClick={() => setCurrentView('admin')}
          className="mt-4 inline-flex items-center gap-1 text-stone-300 hover:text-stone-500 transition-colors"
        >
          <Lock className="w-3 h-3" /> Acesso Restrito
        </button>
      </footer>

      {/* Cart Modal / Sidebar */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          
          {/* Cart Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 bg-red-700 text-white flex justify-between items-center">
              {checkoutStep === 'checkout' ? (
                <button 
                  onClick={() => setCheckoutStep('cart')}
                  className="flex items-center gap-2 hover:text-orange-200 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" /> Voltar
                </button>
              ) : (
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6" /> Seu Pedido
                </h2>
              )}
              <button 
                onClick={() => setIsCartOpen(false)}
                className="p-2 hover:bg-red-800 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-4">
                  <ShoppingCart className="w-16 h-16 opacity-50" />
                  <p>Seu carrinho está vazio.</p>
                </div>
              ) : checkoutStep === 'cart' ? (
                /* --- CART ITEMS VIEW --- */
                <div className="flex flex-col gap-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between bg-stone-50 p-3 rounded-lg border border-stone-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-stone-800">{item.product.name}</h4>
                        <span className="text-orange-600 font-semibold">{formatPrice(item.product.price)}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg p-1">
                        <button 
                          onClick={() => item.quantity === 1 ? removeFromCart(item.product.id) : updateQuantity(item.product.id, -1)}
                          className="p-1 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        </button>
                        <span className="w-6 text-center font-medium">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="p-1 text-stone-500 hover:text-green-600 hover:bg-green-50 rounded"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* --- CHECKOUT FORM VIEW --- */
                <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Seu Nome</label>
                    <input 
                      type="text" 
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Como podemos te chamar?"
                      className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                  </div>

                  {/* Order Type */}
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Como deseja receber?</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setOrderType('delivery')}
                        className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-colors ${
                          orderType === 'delivery' ? 'border-red-600 bg-red-50 text-red-700' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
                        }`}
                      >
                        <MapPin className="w-5 h-5" />
                        <span className="font-medium">Entrega</span>
                        <span className="text-xs opacity-80">+ R$ 12,00</span>
                      </button>
                      <button
                        onClick={() => setOrderType('pickup')}
                        className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-colors ${
                          orderType === 'pickup' ? 'border-red-600 bg-red-50 text-red-700' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
                        }`}
                      >
                        <Utensils className="w-5 h-5" />
                        <span className="font-medium">Retirar no Local</span>
                        <span className="text-xs opacity-80">Grátis</span>
                      </button>
                    </div>
                  </div>

                  {/* Address (Only if Delivery) */}
                  {orderType === 'delivery' && (
                    <div className="animate-in slide-in-from-top-2">
                      <label className="block text-sm font-medium text-stone-700 mb-1">Endereço de Entrega</label>
                      <textarea 
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Rua, Número, Bairro, Complemento..."
                        rows={3}
                        className="w-full p-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                      />
                    </div>
                  )}

                  {/* Payment Method */}
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-2">Forma de Pagamento</label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'pix', label: 'Pix' },
                        { id: 'credit', label: 'Cartão de Crédito' },
                        { id: 'debit', label: 'Cartão de Débito' },
                        { id: 'cash', label: 'Dinheiro' },
                      ].map((method) => (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                          className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                            paymentMethod === method.id ? 'border-red-600 bg-red-50 text-red-700 font-medium' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          {method.label}
                          {paymentMethod === method.id && <CheckCircle2 className="w-5 h-5 text-red-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="p-4 bg-stone-50 border-t border-stone-200">
                {checkoutStep === 'checkout' && (
                  <div className="flex justify-between items-center mb-2 text-sm text-stone-600">
                    <span>Subtotal:</span>
                    <span>{formatPrice(cartTotal)}</span>
                  </div>
                )}
                {checkoutStep === 'checkout' && orderType === 'delivery' && (
                  <div className="flex justify-between items-center mb-2 text-sm text-stone-600">
                    <span>Taxa de Entrega:</span>
                    <span>R$ 12,00</span>
                  </div>
                )}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-stone-600 font-medium">Total do pedido:</span>
                  <span className="text-2xl font-bold text-red-700">
                    {formatPrice(checkoutStep === 'checkout' && orderType === 'delivery' ? cartTotal + 12 : cartTotal)}
                  </span>
                </div>
                
                {checkoutStep === 'cart' ? (
                  <button 
                    className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-colors shadow-md"
                    onClick={() => setCheckoutStep('checkout')}
                  >
                    Avançar para Pagamento
                  </button>
                ) : (
                  <button 
                    className={`w-full text-white font-bold py-3 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2 ${
                      isSubmitting || !isOpen ? 'bg-stone-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                    }`}
                    onClick={handleFinalizeOrder}
                    disabled={isSubmitting || !isOpen}
                  >
                    {!isOpen ? 'Restaurante Fechado' : isSubmitting ? 'Processando...' : 'Finalizar Pedido'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
